"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors } from "lucide-react";
import { Alert, Button, DownloadButton, Field, FileListItem, Input, Select, SegmentedControl, Toggle, baseName, cn, formatFileSize } from "@toolwright/ui";
import { formatPageRanges, type SplitPart } from "@toolwright/core/pdf";
import type { OutlineItem } from "@toolwright/core/pdf-outline";
import { bookmarkStarts, planSplit, readBookmarks, splitDocument, type PlannedPart, type SplitPlanMode } from "@toolwright/core/pdf-split";
import { PdfDrop, PdfLoadStatus, PdfSourceCard, RunButton, RunProgress, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { PageThumb, useThumbnails } from "../../shared/pdf-thumbs";
import { NumberField, num } from "../../shared/number-field";
import { createZip } from "../../shared/zip";
import { errorMessage } from "../../shared/format";

type Kind = "each" | "every" | "cuts" | "ranges" | "bookmarks" | "size" | "odd-even";

const KINDS: { value: Kind; label: string }[] = [
  { value: "cuts", label: "Pick where to split" },
  { value: "each", label: "Every page" },
  { value: "every", label: "Every N pages" },
  { value: "ranges", label: "Page ranges" },
  { value: "bookmarks", label: "At bookmarks" },
  { value: "size", label: "By file size" },
  { value: "odd-even", label: "Odd and even" },
];

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={pdf.clear} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <PdfLoadStatus pdf={pdf} />
      {source ? <Splitter key={`${source.file.name}:${source.file.size}:${source.file.lastModified}`} source={source} /> : null}
      {!source && !pdf.error ? <Alert tone="info">Drop a PDF to choose how to split it.</Alert> : null}
    </div>
  );
}

interface Outcome {
  parts: SplitPart[];
  oversized: number;
}

function Splitter({ source }: { source: PdfSource }) {
  const pageCount = source.info.pageCount;
  const [kind, setKind] = useState<Kind>(pageCount > 1 ? "cuts" : "each");
  const [every, setEvery] = useState("2");
  const [ranges, setRanges] = useState(pageCount > 3 ? `1-2; 3-${pageCount}` : "1; 2");
  const [starts, setStarts] = useState<number[]>(() => (pageCount > 1 ? [Math.ceil(pageCount / 2)] : []));
  const [level, setLevel] = useState<1 | 2>(1);
  const [sizeMb, setSizeMb] = useState("5");
  const [keepBookmarks, setKeepBookmarks] = useState(true);
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const stop = useRef<AbortController | null>(null);
  const thumbs = useThumbnails(source.file);

  useEffect(() => {
    let live = true;
    readBookmarks(source.bytes).then(
      (o) => live && setOutline(o),
      () => live && setOutline([]),
    );
    return () => {
      live = false;
      stop.current?.abort();
    };
  }, [source]);

  const bookmarkCount = useMemo(() => (outline ? bookmarkStarts(outline, level).length : 0), [outline, level]);
  const touch = () => (setOutcome(null), setError(null));

  const mode: SplitPlanMode = useMemo(() => {
    switch (kind) {
      case "each":
        return { type: "each" };
      case "every":
        return { type: "every", pages: num(every) };
      case "ranges":
        return { type: "ranges", spec: ranges };
      case "cuts":
        return { type: "cuts", starts };
      case "bookmarks":
        return { type: "bookmarks", level };
      case "odd-even":
        return { type: "odd-even" };
      case "size":
        return { type: "size", maxBytes: Math.round(num(sizeMb) * 1024 * 1024) };
    }
  }, [kind, every, ranges, starts, level, sizeMb]);

  const plan = useMemo((): { parts: PlannedPart[] | null; error: string | null } => {
    try {
      return { parts: planSplit(mode, pageCount, outline ?? []), error: null };
    } catch (err) {
      return { parts: null, error: errorMessage(err, "Check the settings.") };
    }
  }, [mode, pageCount, outline]);

  /** Clicking between two pages: from a plan of consecutive parts, switch to chosen cuts and add or remove this one. */
  const contiguous = plan.parts?.every((p) => p.pages.every((x, i) => i === 0 || x === (p.pages[i - 1] as number) + 1)) && plan.parts.reduce((n, p) => n + p.pages.length, 0) === pageCount;
  const toggleCut = (page: number) => {
    touch();
    const current = kind === "cuts" ? starts : contiguous && plan.parts ? plan.parts.slice(1).map((p) => p.pages[0] as number) : [];
    setStarts(current.includes(page) ? current.filter((s) => s !== page) : [...current, page].sort((a, b) => a - b));
    setKind("cuts");
  };

  async function run() {
    const controller = new AbortController();
    stop.current = controller;
    setBusy(true);
    touch();
    setProgress(null);
    try {
      setOutcome(await splitDocument(source.bytes, mode, baseName(source.file.name), { keepBookmarks, signal: controller.signal, onProgress: setProgress }));
    } catch (err) {
      setError(errorMessage(err, "The PDF could not be split."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const partOf = useMemo(() => {
    const m = new Map<number, number[]>();
    plan.parts?.forEach((part, k) => part.pages.forEach((p) => m.set(p, [...(m.get(p) ?? []), k])));
    return m;
  }, [plan.parts]);
  const partCount = plan.parts?.length ?? 0;
  const leftOut = plan.parts ? pageCount - partOf.size : 0;

  return (
    <>
      <div className="flex flex-col gap-4 border border-border bg-card p-4">
        <SegmentedControl label="How to split" value={kind} onValueChange={(k) => (setKind(k), touch())} options={KINDS} />
        {kind === "cuts" ? (
          <p className="text-sm text-muted-foreground">
            Click <Scissors aria-hidden className="inline size-3.5" /> between two pages below to start a new file there. Click it again to join them back.
          </p>
        ) : null}
        {kind === "every" ? <NumberField label="Pages per file" value={every} onChange={(v) => (setEvery(v), touch())} min={1} step={1} className="max-w-48" /> : null}
        {kind === "ranges" ? (
          <Field label="Page ranges" hint={`One file per group, separated by semicolons. Example: 1-3; 4; 5-${pageCount}. The PDF has ${pageCount} pages.`}>
            {(id) => <Input id={id} mono value={ranges} onChange={(e) => (setRanges(e.target.value), touch())} />}
          </Field>
        ) : null}
        {kind === "bookmarks" ? (
          outline === null ? (
            <p className="text-sm text-muted-foreground">Reading the bookmarks…</p>
          ) : outline.length === 0 ? null : (
            <Field label="Bookmark levels" className="max-w-xs">
              {(id) => (
                <Select id={id} value={String(level)} onChange={(e) => (setLevel(Number(e.target.value) as 1 | 2), touch())}>
                  <option value="1">Top-level bookmarks (chapters)</option>
                  <option value="2">Top two levels (chapters and sections)</option>
                </Select>
              )}
            </Field>
          )
        ) : null}
        {kind === "size" ? (
          <NumberField
            label="Largest file size"
            suffix="MB"
            value={sizeMb}
            onChange={(v) => (setSizeMb(v), touch())}
            min={0.02}
            step={0.5}
            className="max-w-48"
            hint="Each file holds as many pages as fit. Handy for email attachment limits (often 10 or 25 MB)."
          />
        ) : null}
        <Toggle label="Keep the bookmarks that point into each file" checked={keepBookmarks} onCheckedChange={(v) => (setKeepBookmarks(v), touch())} />
      </div>

      {plan.error ? <Alert tone={kind === "bookmarks" ? "info" : "error"}>{plan.error}</Alert> : null}
      {kind === "bookmarks" && outline?.length && !plan.error ? (
        <p className="text-sm text-muted-foreground">
          {bookmarkCount} {bookmarkCount === 1 ? "bookmark starts" : "bookmarks start"} a file; each file is named after its bookmark.
        </p>
      ) : null}

      <p className="font-medium" aria-live="polite">
        {kind === "size" ? "The number of files depends on how large the pages are." : plan.parts ? `Makes ${partCount} ${partCount === 1 ? "file" : "files"}${leftOut ? `; ${leftOut} ${leftOut === 1 ? "page is" : "pages are"} left out` : ""}.` : null}
      </p>

      <SplitGrid pageCount={pageCount} store={thumbs.store} parts={plan.parts} partOf={partOf} canCut={kind === "cuts" || !!contiguous} cutsAt={new Set(plan.parts && contiguous ? plan.parts.slice(1).map((p) => p.pages[0] as number) : [])} onCut={toggleCut} />

      <div className="flex flex-wrap items-center gap-3">
        <RunButton busy={busy} disabled={!!plan.error || (kind !== "size" && !plan.parts)} onClick={() => void run()}>
          {kind === "size" || !plan.parts ? "Split PDF" : `Split into ${partCount} ${partCount === 1 ? "file" : "files"}`}
        </RunButton>
        {busy ? (
          <Button variant="outline" size="md" onClick={() => stop.current?.abort()}>
            Cancel
          </Button>
        ) : null}
      </div>
      {busy && progress ? <RunProgress label={kind === "size" ? `Page ${progress.done + 1} of ${progress.total}` : `File ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`} done={progress.done} total={progress.total} /> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {outcome ? <Results source={source} outcome={outcome} limitMb={kind === "size" ? num(sizeMb) : null} /> : null}
    </>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function SplitGrid({
  pageCount,
  store,
  parts,
  partOf,
  canCut,
  cutsAt,
  onCut,
}: {
  pageCount: number;
  store: ReturnType<typeof useThumbnails>["store"];
  parts: PlannedPart[] | null;
  partOf: Map<number, number[]>;
  canCut: boolean;
  cutsAt: Set<number>;
  onCut: (page: number) => void;
}) {
  return (
    <ol aria-label="Pages, and the file each one goes into" className="flex flex-wrap items-stretch gap-y-3">
      {Array.from({ length: pageCount }, (_, i) => {
        const inParts = partOf.get(i) ?? [];
        const first = inParts[0];
        const starts = parts?.some((p) => p.pages[0] === i);
        const cut = cutsAt.has(i);
        const tint = first === undefined ? "bg-muted opacity-50" : first % 2 === 0 ? "bg-card" : "bg-secondary";
        return (
          <li key={i} className="flex items-stretch">
            {i > 0 ? (
              canCut ? (
                <button
                  type="button"
                  aria-pressed={cut}
                  aria-label={cut ? `Join pages ${i} and ${i + 1} into one file` : `Split between pages ${i} and ${i + 1}`}
                  title={cut ? "Join" : "Split here"}
                  onClick={() => onCut(i)}
                  className={cn(
                    "group mx-0.5 flex w-6 shrink-0 flex-col items-center justify-center focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    cut ? "text-foreground" : "text-muted-foreground opacity-35 hover:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  <span aria-hidden className={cn("w-0.5 flex-1", cut ? "bg-foreground" : "bg-transparent group-hover:bg-border")} />
                  <Scissors aria-hidden className="my-1 size-4 shrink-0" />
                  <span aria-hidden className={cn("w-0.5 flex-1", cut ? "bg-foreground" : "bg-transparent group-hover:bg-border")} />
                </button>
              ) : (
                <span aria-hidden className={cn("mx-0.5 w-6 shrink-0", starts && "border-l-2 border-foreground")} />
              )
            ) : null}
            <div className={cn("flex w-24 flex-col gap-1 border border-border p-1.5", tint)}>
              <PageThumb store={store} pageIndex={i} className="grid aspect-[3/4] w-full place-items-center overflow-hidden border border-border bg-muted" />
              <p className="flex items-baseline justify-between font-mono text-[11px]">
                <span>{i + 1}</span>
                <span className={cn("px-1", starts ? "bg-marker font-semibold text-marker-foreground" : "text-muted-foreground")}>{first === undefined ? "left out" : `file ${inParts.map((k) => k + 1).join(", ")}`}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Results({ source, outcome, limitMb }: { source: PdfSource; outcome: Outcome; limitMb: number | null }) {
  const { parts, oversized } = outcome;
  const zip = useMemo(() => createZip(parts.map((p) => ({ name: p.name, data: p.data }))), [parts]);
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-l-4 border-foreground border-l-success bg-card p-4 shadow-md">
        <p className="font-medium">
          Created {parts.length} {parts.length === 1 ? "file" : "files"}.
        </p>
        <DownloadButton data={zip} filename={`${baseName(source.file.name)}-split.zip`} mime="application/zip" label="Download all (ZIP)" variant="primary" size="md" />
      </div>
      {oversized && limitMb ? (
        <Alert tone="warning">
          {oversized} {oversized === 1 ? "page is" : "pages are"} larger than {limitMb} MB on {oversized === 1 ? "its" : "their"} own, so {oversized === 1 ? "it is" : "they are"} in a file of {oversized === 1 ? "its" : "their"} own that is over the limit. Compress PDF can make them smaller.
        </Alert>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {parts.map((part) => (
          <FileListItem key={part.name} name={part.name} size={part.data.length} detail={`${part.label ? `${part.label} · ` : ""}${part.pages.length === 1 ? "page" : "pages"} ${formatPageRanges(part.pages.map((p) => p - 1))}`}>
            <DownloadButton data={part.data} filename={part.name} mime="application/pdf" label="" aria-label={`Download ${part.name}`} variant="ghost" size="sm" />
          </FileListItem>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Total {formatFileSize(parts.reduce((n, p) => n + p.data.length, 0))}. Files that share fonts or pictures each carry their own copy, so together they can be larger than the original.</p>
    </div>
  );
}
