"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Alert, Button, Field, FileDropzone, Input, SegmentedControl, Toggle, baseName, formatFileSize } from "@toolwright/ui";
import { isPdf, parsePageRanges } from "@toolwright/core/pdf";
import { alternatePdfs, alternateSequence, halves, type MixResult, type MixSource } from "@toolwright/core/pdf-insert";
import { DownloadResult, isLockedPdf, JobError, PdfLoadStatus, readPdfFile, RunButton, useJob, useLockedPdfs, type LockedPdf, type PdfSource } from "../../shared/pdf-ui";
import { usePdfHandoff } from "../../shared/pdf-handoff";
import { PageThumb, useThumbStores } from "../../shared/pdf-thumbs";
import { moveInList } from "../../shared/drag-reorder";
import { NumberField, num } from "../../shared/number-field";
import { errorMessage } from "../../shared/format";

interface Item {
  id: number;
  file: File;
  bytes: Uint8Array;
  pages: number;
  range: string;
  reverse: boolean;
  take: string;
}

type Mode = "files" | "one";

let nextId = 1;
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `F${i + 1}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Shown preview tiles; longer mixes show the start and say how many more follow. */
const PREVIEW_LIMIT = 120;

function rangeOf(item: Item): { pages: number[] | undefined; error: string | null } {
  if (!item.range.trim()) return { pages: undefined, error: null };
  try {
    return { pages: parsePageRanges(item.range, item.pages), error: null };
  } catch (err) {
    return { pages: undefined, error: errorMessage(err, "Check the pages.") };
  }
}

export default function Tool() {
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<Mode>("files");
  const [reverseBacks, setReverseBacks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const job = useJob<MixResult>();
  const { reset } = job;

  const toItem = (s: PdfSource, position: number): Item => ({ id: nextId++, file: s.file, bytes: s.bytes, pages: s.info.pageCount, range: "", reverse: position === 1, take: "1" });
  const append = (added: PdfSource[]) => setItems((current) => [...current, ...added.map((s, k) => toItem(s, current.length + k))]);
  const locks = useLockedPdfs((s) => append([s]));

  const addFiles = async (files: File[]) => {
    setError(null);
    const added: PdfSource[] = [];
    const waiting: LockedPdf[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        if (!isPdf(new Uint8Array(await file.slice(0, 5).arrayBuffer()))) throw new Error("not a PDF file.");
        const read = await readPdfFile(file);
        if (isLockedPdf(read)) waiting.push(read);
        else added.push(read);
      } catch (err) {
        problems.push(`${file.name}: ${errorMessage(err, "could not be read.")}`);
      }
    }
    if (problems.length) setError(problems.join(" "));
    if (added.length) append(added);
    locks.addLocked(waiting);
  };
  usePdfHandoff((file) => void addFiles([file]));

  const update = (id: number, change: Partial<Item>) => setItems((c) => c.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const ranges = useMemo(() => new Map(items.map((it) => [it.id, rangeOf(it)])), [items]);
  const rangeErrors = items.filter((it) => ranges.get(it.id)?.error);

  // One file: its first half holds the fronts and the second half the backs.
  const single = mode === "one" ? items[0] : undefined;
  const sources: MixSource[] = useMemo(() => {
    if (mode === "one") {
      if (!single) return [];
      const { fronts, backs } = halves(single.pages);
      return [
        { file: 0, pageCount: single.pages, pages: fronts },
        { file: 0, pageCount: single.pages, pages: backs, reverse: reverseBacks },
      ];
    }
    return items.map((it) => ({ pageCount: it.pages, pages: ranges.get(it.id)?.pages, reverse: it.reverse, take: Math.max(1, Math.floor(num(it.take)) || 1) }));
  }, [mode, single, items, ranges, reverseBacks]);
  const files = mode === "one" ? (single ? [single] : []) : items;
  const sequence = useMemo(() => alternateSequence(sources), [sources]);

  useEffect(() => reset(), [items, mode, reverseBacks, reset]);

  const counts = sources.map((s) => s.pages?.length ?? s.pageCount);
  const mismatch = counts.length === 2 && counts[0] !== counts[1] && !(mode === "one" && counts[0] === (counts[1] ?? 0) + 1);
  const ready = rangeErrors.length === 0 && sequence.length > 0 && (mode === "one" ? !!single && single.pages >= 2 : items.length >= 2);

  const run = () => job.run(() => alternatePdfs(files.map((f) => ({ bytes: f.bytes, name: f.file.name })), sources));
  const stores = useThumbStores(files);
  const storeFor = (file: number) => stores.get(files[file]?.id ?? -1) ?? null;
  const sourceName = (file: number, page: number) => (mode === "one" ? `page ${page + 1}` : `${letter(file)} page ${page + 1}`);

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl<Mode>
        label="Your pages are in"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "files", label: "Two or more files" },
          { value: "one", label: "One file: fronts, then backs" },
        ]}
      />
      <FileDropzone
        accept=".pdf,application/pdf"
        multiple={mode === "files"}
        label={mode === "one" ? (single ? "Replace the PDF" : "Drop the scanned PDF here, or click to browse") : items.length ? "Add more PDFs" : "Drop the PDFs here, or click to browse"}
        hint={mode === "one" ? "One PDF with every front first and every back after them. It never leaves your device." : "For a one-sided scan, add the fronts first, then the backs. They never leave your device."}
        onReject={setError}
        onFiles={(fs) => {
          if (mode === "one") setItems([]);
          void addFiles(mode === "one" ? fs.slice(0, 1) : fs);
        }}
      />
      {error ? <Alert tone="warning">{error}</Alert> : null}
      <PdfLoadStatus pdf={{ error: null, ...locks }} />

      {mode === "files" && items.length > 0 ? (
        <ol aria-label="Files to mix, in turn order" className="flex flex-col gap-2">
          {items.map((item, i) => {
            const range = ranges.get(item.id);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 border border-border bg-card p-2.5">
                <span aria-hidden className="w-6 shrink-0 text-center font-mono text-sm font-semibold">
                  {letter(i)}
                </span>
                <PageThumb store={stores.get(item.id) ?? null} pageIndex={0} className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden border border-border bg-muted" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatFileSize(item.file.size)} · {plural(item.pages, "page")}
                    {range?.pages ? ` · taking ${range.pages.length}` : ""}
                  </p>
                </div>
                <Field label={`Pages of ${item.file.name}`} className="w-32 [&_label]:sr-only">
                  {(id) => (
                    <Input id={id} mono placeholder="All pages" value={item.range} aria-invalid={range?.error ? true : undefined} title={range?.error ?? "Leave empty for all pages, or type pages such as 1-3, 5"} onChange={(e) => update(item.id, { range: e.target.value })} />
                  )}
                </Field>
                <NumberField
                  label={
                    <>
                      At a time<span className="sr-only"> from {item.file.name}</span>
                    </>
                  }
                  value={item.take}
                  onChange={(v) => update(item.id, { take: v })}
                  min={1}
                  max={Math.max(item.pages, 1)}
                  step={1}
                  className="w-24"
                />
                <Toggle
                  label={
                    <>
                      Reverse<span className="sr-only"> {item.file.name}</span>
                    </>
                  }
                  checked={item.reverse}
                  onCheckedChange={(v) => update(item.id, { reverse: v })}
                />
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.file.name} up`} disabled={i === 0} onClick={() => setItems((c) => moveInList(c, i, i - 1))}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.file.name} down`} disabled={i === items.length - 1} onClick={() => setItems((c) => moveInList(c, i, i + 1))}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((c) => c.filter((x) => x.id !== item.id))}>
                    <Trash2 />
                  </Button>
                </div>
                {range?.error ? <p className="w-full text-xs text-danger">{range.error}</p> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {mode === "files" && items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Pages are taken from each file in turn: one from A, one from B, and so on (or more at a time if you set it). Reverse takes a file last page first, for backs scanned by turning the stack over. When a file runs out, the rest of the others go at the end.
        </p>
      ) : null}
      {mode === "files" && items.length === 1 ? <Alert tone="info">Add the second file, such as the backs of the pages.</Alert> : null}

      {single ? (
        <div className="flex flex-col gap-3 border border-border bg-card p-4">
          <p className="text-sm">
            <span className="font-medium">{single.file.name}</span> · {plural(single.pages, "page")}: pages 1 to {counts[0]} are the fronts and the rest are the backs.
          </p>
          <Toggle label="The backs are in reverse order" hint="On when you turned the stack over to scan the backs, so the last back came first." checked={reverseBacks} onCheckedChange={setReverseBacks} />
          {single.pages < 2 ? <Alert tone="info">This PDF has one page, so there is nothing to mix.</Alert> : null}
        </div>
      ) : null}

      {mismatch ? (
        <Alert tone="warning">
          {mode === "one" ? "The halves" : "The first two files"} have {counts[0]} and {counts[1]} pages. If they are fronts and backs, check that no page was missed or scanned twice. The extra pages go at the end.
        </Alert>
      ) : null}

      {sequence.length > 0 && files.length > 0 ? (
        <section aria-label="The mixed page order" className="flex flex-col gap-2">
          <p className="font-medium" aria-live="polite">
            The new PDF has {plural(sequence.length, "page")}, in this order:
          </p>
          <ol className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {sequence.slice(0, PREVIEW_LIMIT).map((e, i) => {
              if ("blank" in e) return null;
              return (
                <li key={i} aria-label={`Page ${i + 1}: ${mode === "one" ? "" : "file "}${sourceName(e.file, e.page)}`} className="flex flex-col gap-1 border border-border bg-card p-1.5">
                  <PageThumb store={storeFor(e.file)} pageIndex={e.page} className="grid aspect-[3/4] w-full place-items-center overflow-hidden border border-border bg-muted" />
                  <p className="flex items-baseline justify-between gap-1 font-mono text-[11px]">
                    <span className="font-semibold">{i + 1}</span>
                    <span className="truncate text-muted-foreground">{sourceName(e.file, e.page)}</span>
                  </p>
                </li>
              );
            })}
          </ol>
          {sequence.length > PREVIEW_LIMIT ? <p className="text-sm text-muted-foreground">…and {sequence.length - PREVIEW_LIMIT} more pages in the same pattern.</p> : null}
        </section>
      ) : null}

      {rangeErrors.length ? <Alert tone="error">Check the pages for {rangeErrors.map((it) => it.file.name).join(", ")}.</Alert> : null}
      {files.length > 0 ? (
        <RunButton busy={job.busy} disabled={!ready} onClick={run}>
          Mix pages
        </RunButton>
      ) : null}
      <JobError error={job.error} />
      {job.result && files[0] ? <DownloadResult data={job.result.data} filename={`${baseName(files[0].file.name)}-mixed.pdf`} note={plural(job.result.pages, "page")} /> : null}
    </div>
  );
}
