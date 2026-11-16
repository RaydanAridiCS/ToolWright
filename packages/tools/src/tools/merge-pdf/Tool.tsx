"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, GripVertical, RotateCw, Trash2 } from "lucide-react";
import { Alert, Button, Field, FileDropzone, Input, SegmentedControl, Toggle, cn, formatFileSize } from "@toolwright/ui";
import { isPdf, parsePageRanges } from "@toolwright/core/pdf";
import { mergeDocuments, sequenceFromFiles, type MergeEntry, type MergeResult } from "@toolwright/core/pdf-merge";
import { DownloadResult, isLockedPdf, JobError, PdfLoadStatus, readPdfFile, RunButton, useJob, useLockedPdfs, type LockedPdf, type PdfSource } from "../../shared/pdf-ui";
import { usePdfHandoff } from "../../shared/pdf-handoff";
import { PageThumb, useThumbStores, type ThumbStore } from "../../shared/pdf-thumbs";
import { moveInList, useDragReorder } from "../../shared/drag-reorder";
import { errorMessage } from "../../shared/format";

interface Item {
  id: number;
  file: File;
  name: string;
  size: number;
  pages: number;
  bytes: Uint8Array;
  /** Which pages to take, such as "1-3, 5". Empty means all. */
  range: string;
}

/** One page in the hand-arranged order. */
interface Placed {
  key: string;
  item: number;
  page: number;
  turn: number;
}

type View = "files" | "pages";

let nextId = 1;
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `F${i + 1}`);

function rangeOf(item: Item): { pages: number[] | null; error: string | null } {
  if (!item.range.trim()) return { pages: null, error: null };
  try {
    return { pages: parsePageRanges(item.range, item.pages), error: null };
  } catch (err) {
    return { pages: null, error: errorMessage(err, "Check the pages.") };
  }
}

export default function Tool() {
  const [items, setItems] = useState<Item[]>([]);
  const [arranged, setArranged] = useState<Placed[] | null>(null);
  const [view, setView] = useState<View>("files");
  const [bookmarkPerFile, setBookmarkPerFile] = useState(true);
  const [keepBookmarks, setKeepBookmarks] = useState(true);
  const [rightHand, setRightHand] = useState(false);
  const [keepForms, setKeepForms] = useState(true);
  const [outName, setOutName] = useState("merged");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const job = useJob<MergeResult>();

  const toItem = (s: PdfSource): Item => ({ id: nextId++, file: s.file, name: s.file.name, size: s.file.size, pages: s.info.pageCount, bytes: s.bytes, range: "" });
  const append = (added: Item[]) => {
    job.reset();
    setItems((current) => [...current, ...added]);
    // Hand-arranged pages keep their order; new files' pages go at the end.
    setArranged((a) => (a ? [...a, ...added.flatMap((it) => Array.from({ length: it.pages }, (_, p) => ({ key: `${it.id}:${p}:${Math.random()}`, item: it.id, page: p, turn: 0 })))] : a));
  };
  // Password-protected files wait for their password, then join the end of the list.
  const locks = useLockedPdfs((s) => append([toItem(s)]));

  const addFiles = async (files: File[]) => {
    setError(null);
    const added: Item[] = [];
    const waiting: LockedPdf[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        if (!isPdf(new Uint8Array(await file.slice(0, 5).arrayBuffer()))) throw new Error("not a PDF file.");
        const read = await readPdfFile(file);
        if (isLockedPdf(read)) waiting.push(read);
        else added.push(toItem(read));
      } catch (err) {
        problems.push(`${file.name}: ${errorMessage(err, "could not be read.")}`);
      }
    }
    if (problems.length) setError(problems.join(" "));
    if (added.length) append(added);
    locks.addLocked(waiting);
  };

  // A file passed on from another tool ("Continue with…") becomes the first file to merge.
  usePdfHandoff((file) => void addFiles([file]));

  /** A change to the files that decides the page order again (it replaces a hand-made page order). */
  const changeFiles = (next: (current: Item[]) => Item[]) => {
    job.reset();
    setItems(next);
    if (arranged) {
      setArranged(null);
      setNotice("The page order now follows the files again.");
    }
  };

  const remove = (id: number) => {
    job.reset();
    setItems((c) => c.filter((x) => x.id !== id));
    setArranged((a) => (a ? a.filter((p) => p.item !== id) : a));
  };

  const ranges = useMemo(() => new Map(items.map((it) => [it.id, rangeOf(it)])), [items]);
  const rangeErrors = items.filter((it) => ranges.get(it.id)?.error);

  const sequence: MergeEntry[] = useMemo(() => {
    const index = new Map(items.map((it, i) => [it.id, i]));
    if (arranged) return arranged.flatMap((p) => (index.has(p.item) ? [{ file: index.get(p.item) as number, page: p.page, turn: p.turn }] : []));
    return sequenceFromFiles(
      items.map((it) => ({ pageCount: it.pages, pages: ranges.get(it.id)?.pages ?? undefined })),
      rightHand,
    );
  }, [items, arranged, ranges, rightHand]);
  const pageTotal = sequence.filter((e) => !("blank" in e)).length;
  const blankTotal = sequence.length - pageTotal;

  const openPages = () => {
    setView("pages");
    setNotice(null);
    if (!arranged) {
      const order: Placed[] = [];
      for (const e of sequenceFromFiles(items.map((it) => ({ pageCount: it.pages, pages: ranges.get(it.id)?.pages ?? undefined })))) {
        if ("blank" in e) continue;
        const it = items[e.file] as Item;
        order.push({ key: `${it.id}:${e.page}:${order.length}`, item: it.id, page: e.page, turn: 0 });
      }
      setArranged(order);
    }
  };

  const run = () =>
    job.run(() =>
      mergeDocuments(
        items.map((it) => ({ bytes: it.bytes, name: it.name })),
        sequence,
        { bookmarkPerFile, keepBookmarks, keepForms },
      ),
    );

  const fileName = `${(outName.trim() || "merged").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
  const canRun = items.length > 0 && pageTotal > 0 && rangeErrors.length === 0 && (items.length > 1 || arranged !== null || items.some((it) => it.range.trim()));

  return (
    <div className="flex flex-col gap-5">
      <FileDropzone accept=".pdf,application/pdf" multiple label={items.length ? "Add more PDFs" : "Drop PDFs here, or click to browse"} hint="Add two or more PDF files. They never leave your device." onReject={setError} onFiles={addFiles} />
      {error ? <Alert tone="warning">{error}</Alert> : null}
      <PdfLoadStatus pdf={{ error: null, ...locks }} />

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-border bg-card p-3">
            <SegmentedControl<View>
              label="Arrange by"
              value={view}
              onValueChange={(v) => (v === "pages" ? openPages() : setView("files"))}
              options={[
                { value: "files", label: "Files" },
                { value: "pages", label: "Single pages" },
              ]}
            />
            {view === "files" ? (
              <Button variant="outline" size="sm" disabled={items.length < 2} onClick={() => changeFiles((c) => [...c].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })))}>
                <ArrowUpDown aria-hidden /> Sort by name
              </Button>
            ) : arranged ? (
              <Button variant="outline" size="sm" onClick={() => (setArranged(null), setView("files"), job.reset())}>
                Start the page order again
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => (setItems([]), setArranged(null), setView("files"), job.reset())}>
              Clear all
            </Button>
            <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
              {items.length} {items.length === 1 ? "file" : "files"} · {pageTotal} {pageTotal === 1 ? "page" : "pages"}
              {blankTotal ? ` + ${blankTotal} blank` : ""}
            </p>
          </div>
          {notice ? <Alert tone="info">{notice}</Alert> : null}

          {view === "files" ? <FileList items={items} ranges={ranges} arranged={arranged !== null} changeFiles={changeFiles} remove={remove} /> : <PageGrid items={items} arranged={arranged ?? []} setArranged={(a) => (job.reset(), setArranged(a))} />}

          <div className="flex flex-col gap-3 border border-border bg-card p-4">
            <p className="label-plate">Options</p>
            <Toggle label="Add a bookmark for each file" hint="Named after the file, so readers can jump between the documents." checked={bookmarkPerFile} onCheckedChange={(v) => (setBookmarkPerFile(v), job.reset())} />
            <Toggle label="Keep the bookmarks inside each file" checked={keepBookmarks} onCheckedChange={(v) => (setKeepBookmarks(v), job.reset())} />
            <Toggle label="Keep form fields fillable" hint="Fields with the same name in two files are renamed, so filling one does not fill the other." checked={keepForms} onCheckedChange={(v) => (setKeepForms(v), job.reset())} />
            {arranged ? null : (
              <Toggle
                label="Start each file on a right-hand page"
                hint="Adds a blank page after a file that ends on a left-hand page, so every file starts on the front of a sheet when printed double-sided."
                checked={rightHand}
                onCheckedChange={(v) => (setRightHand(v), job.reset())}
              />
            )}
            <Field label="File name" className="max-w-sm">
              {(id) => (
                <div className="flex items-center gap-2">
                  <Input id={id} value={outName} maxLength={120} onChange={(e) => (setOutName(e.target.value), job.reset())} />
                  <span className="text-sm text-muted-foreground">.pdf</span>
                </div>
              )}
            </Field>
          </div>

          {rangeErrors.length ? <Alert tone="error">Check the pages for {rangeErrors.map((it) => it.name).join(", ")}.</Alert> : null}
          <div className="flex flex-wrap items-center gap-4">
            <RunButton busy={job.busy} disabled={!canRun} onClick={run}>
              Merge {items.length} {items.length === 1 ? "PDF" : "PDFs"} ({pageTotal} {pageTotal === 1 ? "page" : "pages"})
            </RunButton>
            {items.length < 2 && !canRun ? <span className="text-sm text-muted-foreground">Add at least one more PDF, or choose pages to take from this one.</span> : null}
          </div>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? (
        <div className="flex flex-col gap-3">
          <DownloadResult data={job.result.data} filename={fileName} note={`${job.result.pages} pages${job.result.blanks ? `, ${job.result.blanks} of them blank` : ""}`} />
          {job.result.renamedFields ? (
            <Alert tone="info">
              {job.result.renamedFields} form {job.result.renamedFields === 1 ? "field was" : "fields were"} renamed (for example “name” became “name_2”), because more than one file had a field with that name.
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Files                                                                                            */
/* ----------------------------------------------------------------------------------------------- */

function FileList({
  items,
  ranges,
  arranged,
  changeFiles,
  remove,
}: {
  items: Item[];
  ranges: Map<number, { pages: number[] | null; error: string | null }>;
  arranged: boolean;
  changeFiles: (next: (current: Item[]) => Item[]) => void;
  remove: (id: number) => void;
}) {
  const drag = useDragReorder((from, to) => changeFiles((c) => moveInList(c, from, to)));
  // One PDF.js worker per file draws its first page; with many files the list goes without pictures.
  const stores = useThumbStores(items, items.length <= 20);
  return (
    <>
      {arranged ? <p className="text-sm text-muted-foreground">You arranged single pages by hand. Moving files or changing their pages here starts the page order again from the files.</p> : null}
      <ol aria-label="Files to merge, in order" className="flex flex-col gap-2">
        {items.map((item, i) => {
          const range = ranges.get(item.id);
          const taken = range?.pages?.length ?? item.pages;
          return (
            <li
              key={item.id}
              {...drag.itemProps(i)}
              className={cn("flex flex-wrap items-center gap-3 border bg-card p-2.5 sm:flex-nowrap", drag.over === i && drag.dragging !== i ? "border-2 border-foreground" : "border-border", drag.dragging === i && "opacity-50")}
            >
              <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted-foreground" />
              <span aria-hidden className="w-6 shrink-0 text-center font-mono text-sm font-semibold">
                {letter(i)}
              </span>
              <PageThumb store={stores.get(item.id) ?? null} pageIndex={range?.pages?.[0] ?? 0} className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden border border-border bg-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatFileSize(item.size)} · {item.pages} {item.pages === 1 ? "page" : "pages"}
                  {range?.pages ? ` · taking ${taken}` : ""}
                </p>
              </div>
              <Field label={`Pages of ${item.name}`} className="w-40 [&_label]:sr-only">
                {(id) => (
                  <Input
                    id={id}
                    mono
                    placeholder="All pages"
                    value={item.range}
                    aria-invalid={range?.error ? true : undefined}
                    title={range?.error ?? "Leave empty for all pages, or type pages such as 1-3, 5"}
                    onChange={(e) => {
                      const value = e.target.value;
                      changeFiles((c) => c.map((x) => (x.id === item.id ? { ...x, range: value } : x)));
                    }}
                  />
                )}
              </Field>
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.name} up`} disabled={i === 0} onClick={() => changeFiles((c) => moveInList(c, i, i - 1))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.name} down`} disabled={i === items.length - 1} onClick={() => changeFiles((c) => moveInList(c, i, i + 1))}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}>
                  <Trash2 />
                </Button>
              </div>
              {range?.error ? <p className="w-full text-xs text-danger">{range.error}</p> : null}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">Drag files to change their order, or use the arrows. In “Pages”, leave the box empty to take every page, or type pages such as 1-3, 5 (in the order you want them).</p>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Single pages                                                                                     */
/* ----------------------------------------------------------------------------------------------- */

function PageGrid({ items, arranged, setArranged }: { items: Item[]; arranged: Placed[]; setArranged: (a: Placed[]) => void }) {
  const stores = useThumbStores(items);
  const drag = useDragReorder((from, to) => setArranged(moveInList(arranged, from, to)));
  const fileIndex = new Map(items.map((it, i) => [it.id, i]));
  if (arranged.length === 0) return <Alert tone="info">Every page has been removed. Start the page order again, or add more PDFs.</Alert>;
  return (
    <>
      <p className="text-sm text-muted-foreground">Drag pages to put them in any order, across files. Use the buttons on a page to move, turn or remove it.</p>
      <ol aria-label="Pages of the merged file, in order" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
        {arranged.map((p, i) => {
          const f = fileIndex.get(p.item) ?? 0;
          const name = `${letter(f)} page ${p.page + 1}`;
          return (
            <li
              key={p.key}
              {...drag.itemProps(i)}
              aria-label={`Position ${i + 1}: file ${name}${p.turn ? `, turned ${p.turn}°` : ""}`}
              className={cn("flex cursor-grab flex-col gap-1.5 border bg-card p-2", drag.over === i && drag.dragging !== i ? "border-2 border-foreground" : "border-border", drag.dragging === i && "opacity-50")}
            >
              <PageThumb store={(stores.get(p.item) as ThumbStore | undefined) ?? null} pageIndex={p.page} turn={p.turn} className="grid aspect-[3/4] w-full place-items-center overflow-hidden border border-border bg-muted" />
              <p className="flex items-baseline justify-between gap-1 font-mono text-xs">
                <span className="font-semibold">{i + 1}</span>
                <span className="truncate text-muted-foreground" title={items[f]?.name}>
                  {name}
                </span>
              </p>
              <div className="flex justify-between">
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Move ${name} earlier`} disabled={i === 0} onClick={() => setArranged(moveInList(arranged, i, i - 1))}>
                  <ArrowLeft />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Turn ${name} clockwise`} onClick={() => setArranged(arranged.map((x, k) => (k === i ? { ...x, turn: (x.turn + 90) % 360 } : x)))}>
                  <RotateCw />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Remove ${name}`} onClick={() => setArranged(arranged.filter((_, k) => k !== i))}>
                  <Trash2 />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Move ${name} later`} disabled={i === arranged.length - 1} onClick={() => setArranged(moveInList(arranged, i, i + 1))}>
                  <ArrowRight />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
