"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, CopyButton, SegmentedControl, Stat, StatGrid, Toggle, cn } from "@toolwright/ui";
import { diffPixels } from "@toolwright/core/image-compare";
import { PdfCancelled } from "@toolwright/core/pdf-to-images";
import { TEXT_LIMITS, checkTextRun } from "@toolwright/core/pdf-to-text";
import {
  collapseRows,
  compareText,
  looksScanned,
  nextChangedPage,
  pageChange,
  pairPages,
  shapesDiffer,
  textReport,
  type CompareRow,
  type PageChange,
} from "@toolwright/core/compare-pdf";
import { createThumbnailer, extractPdfText, type PageThumbnailer } from "../../shared/pdf-raster";
import { PdfDrop, PdfSourceCard, RunProgress, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { errorMessage, formatInt } from "../../shared/format";

/* ----------------------------------------------------------------------------------------------- */
/* Reading text                                                                                     */
/* ----------------------------------------------------------------------------------------------- */

interface TextRead {
  status: "idle" | "reading" | "done" | "failed";
  pages: string[];
  truncated: boolean;
  done: number;
  total: number;
  error?: string;
}

const NO_TEXT: TextRead = { status: "idle", pages: [], truncated: false, done: 0, total: 0 };

/** Reads the text layer of one PDF as soon as it is chosen. A newer file cancels the older read. */
function useDocumentText(source: PdfSource | null): TextRead {
  const [read, setRead] = useState<TextRead>(NO_TEXT);

  useEffect(() => {
    if (!source) {
      setRead(NO_TEXT);
      return;
    }
    const refuse = checkTextRun(source.file.size, source.info.pageCount).refuse;
    if (refuse) {
      setRead({ ...NO_TEXT, status: "failed", error: refuse });
      return;
    }
    const stop = new AbortController();
    setRead({ ...NO_TEXT, status: "reading", total: source.info.pageCount });
    extractPdfText(source.file, {
      joinHyphens: true,
      signal: stop.signal,
      onProgress: (p) => !stop.signal.aborted && setRead((r) => (r.status === "reading" ? { ...r, done: p.done, total: p.total } : r)),
    }).then(
      (result) => !stop.signal.aborted && setRead({ status: "done", pages: result.pages, truncated: result.truncated, done: result.pageCount, total: result.pageCount }),
      (err) => {
        if (stop.signal.aborted || err instanceof PdfCancelled) return;
        setRead({ ...NO_TEXT, status: "failed", error: errorMessage(err, "The text could not be read.") });
      },
    );
    return () => stop.abort();
  }, [source]);

  return read;
}

/* ----------------------------------------------------------------------------------------------- */
/* Page pictures                                                                                    */
/* ----------------------------------------------------------------------------------------------- */

const OVERVIEW_SIDE = 400;
const VIEW_SIDE = 900;
const MAX_COMPARED_PAGES = 300;

type Sensitivity = "any" | "normal" | "faint";
const THRESHOLDS: Record<Sensitivity, number> = { any: 8, normal: 28, faint: 70 };

/** Two page renderers, one per file, made when `enabled` and released when the files change. */
function useRenderers(a: PdfSource | null, b: PdfSource | null, enabled: boolean) {
  const [renderers, setRenderers] = useState<{ a: PageThumbnailer; b: PageThumbnailer } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !a || !b) return;
    let cancelled = false;
    const made: PageThumbnailer[] = [];
    (async () => {
      try {
        const ra = await createThumbnailer(a.file, OVERVIEW_SIDE);
        made.push(ra);
        const rb = await createThumbnailer(b.file, OVERVIEW_SIDE);
        made.push(rb);
        if (!cancelled) setRenderers({ a: ra, b: rb });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "The pages could not be drawn."));
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((m) => m.dispose());
      setRenderers(null);
      setError(null);
    };
  }, [a, b, enabled]);

  return { renderers, error };
}

interface PagePair {
  a: ImageData;
  b: ImageData;
  width: number;
  height: number;
  sizeDiffers: boolean;
}

/** Decodes both pages and puts them on the first page's canvas size; the second is stretched when its shape differs. */
async function decodePair(blobA: Blob, blobB: Blob): Promise<PagePair> {
  const [bitmapA, bitmapB] = await Promise.all([createImageBitmap(blobA), createImageBitmap(blobB)]);
  try {
    const width = bitmapA.width;
    const height = bitmapA.height;
    const read = (bitmap: ImageBitmap) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("This browser cannot read the page pictures.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height);
      canvas.width = canvas.height = 0;
      return data;
    };
    return { a: read(bitmapA), b: read(bitmapB), width, height, sizeDiffers: shapesDiffer(bitmapA, bitmapB) };
  } finally {
    bitmapA.close();
    bitmapB.close();
  }
}

interface Overview {
  status: "idle" | "scanning" | "done" | "failed";
  changes: PageChange[];
  done: number;
  total: number;
  error?: string;
}

const NO_OVERVIEW: Overview = { status: "idle", changes: [], done: 0, total: 0 };

/** Compares page 1 of A with page 1 of B, then page 2, and so on, and says how much of each page differs. */
function useOverview(a: PdfSource | null, b: PdfSource | null, renderers: { a: PageThumbnailer; b: PageThumbnailer } | null, threshold: number) {
  const [overview, setOverview] = useState<Overview>(NO_OVERVIEW);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!a || !b || !renderers) {
      setOverview(NO_OVERVIEW);
      return;
    }
    const pairs = pairPages(a.info.pageCount, b.info.pageCount);
    const total = Math.min(pairs.common, MAX_COMPARED_PAGES);
    let cancelled = false;
    stopRef.current = false;
    const changes: PageChange[] = [];
    setOverview({ status: "scanning", changes: [], done: 0, total });
    (async () => {
      for (let i = 0; i < total && !cancelled && !stopRef.current; i++) {
        const [blobA, blobB] = [await renderers.a.render(i, OVERVIEW_SIDE), await renderers.b.render(i, OVERVIEW_SIDE)];
        const pair = await decodePair(blobA, blobB);
        const result = diffPixels(pair.a.data, pair.b.data, pair.width, pair.height, { threshold });
        changes.push(pageChange(i + 1, result.percent, pair.sizeDiffers));
        if (!cancelled) setOverview({ status: "scanning", changes: [...changes], done: changes.length, total });
      }
      if (!cancelled) setOverview({ status: "done", changes: [...changes], done: changes.length, total });
    })().catch((err) => {
      if (!cancelled) setOverview({ status: "failed", changes: [...changes], done: changes.length, total, error: errorMessage(err, "The pages could not be compared.") });
    });
    return () => {
      cancelled = true;
    };
  }, [a, b, renderers, threshold]);

  return { overview, stop: () => (stopRef.current = true) };
}

interface PageView {
  aUrl: string;
  bUrl: string;
  mask: ImageData;
  percent: number;
  sizeDiffers: boolean;
}

/** One page pair drawn large, with the pixels that differ. */
function usePageView(renderers: { a: PageThumbnailer; b: PageThumbnailer } | null, page: number | null, threshold: number) {
  const [view, setView] = useState<PageView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!renderers || page === null) {
      setView(null);
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const blobA = await renderers.a.render(page - 1, VIEW_SIDE);
      const blobB = await renderers.b.render(page - 1, VIEW_SIDE);
      const pair = await decodePair(blobA, blobB);
      const result = diffPixels(pair.a.data, pair.b.data, pair.width, pair.height, { threshold, withMask: true });
      if (cancelled) return;
      urls.push(URL.createObjectURL(blobA), URL.createObjectURL(blobB));
      setError(null);
      setView({ aUrl: urls[0] as string, bUrl: urls[1] as string, mask: new ImageData(new Uint8ClampedArray(result.mask as Uint8ClampedArray), pair.width, pair.height), percent: result.percent, sizeDiffers: pair.sizeDiffers });
    })().catch((err) => !cancelled && setError(errorMessage(err, "This page could not be drawn.")));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [renderers, page, threshold]);

  return { view, error };
}

const percentText = (ratio: number) => (ratio === 0 ? "0%" : ratio < 0.0001 ? "<0.01%" : `${(ratio * 100).toFixed(ratio < 0.01 ? 2 : 1)}%`);

function DifferenceCanvas({ view }: { view: PageView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      element.width = view.mask.width;
      element.height = view.mask.height;
      const context = element.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, element.width, element.height);
      // The old page, faded, so the changes sit in context.
      context.globalAlpha = 0.35;
      context.drawImage(image, 0, 0, element.width, element.height);
      context.globalAlpha = 1;
      const overlay = document.createElement("canvas");
      overlay.width = view.mask.width;
      overlay.height = view.mask.height;
      overlay.getContext("2d")?.putImageData(view.mask, 0, 0);
      context.drawImage(overlay, 0, 0);
    };
    image.src = view.aUrl;
    return () => {
      live = false;
    };
  }, [view]);
  return <canvas ref={canvas} role="img" aria-label="The old page, faded, with the parts that differ in red" className="h-auto w-full border border-foreground bg-card" />;
}

function PicturesTab({ a, b }: { a: PdfSource; b: PdfSource }) {
  const [sensitivity, setSensitivity] = useState<Sensitivity>("normal");
  const [mode, setMode] = useState<"difference" | "side">("difference");
  const [selected, setSelected] = useState<number | null>(null);
  const threshold = THRESHOLDS[sensitivity];
  const { renderers, error: rendererError } = useRenderers(a, b, true);
  const { overview, stop } = useOverview(a, b, renderers, threshold);
  const { view, error: viewError } = usePageView(renderers, selected, threshold);
  const pairs = pairPages(a.info.pageCount, b.info.pageCount);
  const changedCount = overview.changes.filter((c) => c.changed).length;

  // Open the first changed page when the overview is ready.
  useEffect(() => {
    if (overview.status === "done") setSelected((current) => current ?? overview.changes.find((c) => c.changed)?.page ?? (overview.changes.length ? 1 : null));
  }, [overview]);

  const go = (direction: 1 | -1) => {
    const page = nextChangedPage(overview.changes, selected ?? 0, direction);
    if (page !== null) setSelected(page);
  };

  return (
    <div className="flex flex-col gap-4">
      {rendererError ? <Alert tone="error">{rendererError}</Alert> : null}
      {pairs.common === 0 ? <Alert tone="warning">One of the files has no pages to compare.</Alert> : null}
      {pairs.onlyInA.length || pairs.onlyInB.length ? (
        <Alert tone="info">
          {pairs.onlyInA.length ? `Only in A: page${pairs.onlyInA.length === 1 ? "" : "s"} ${pairs.onlyInA[0]}${pairs.onlyInA.length > 1 ? `–${pairs.onlyInA[pairs.onlyInA.length - 1]}` : ""}. ` : ""}
          {pairs.onlyInB.length ? `Only in B: page${pairs.onlyInB.length === 1 ? "" : "s"} ${pairs.onlyInB[0]}${pairs.onlyInB.length > 1 ? `–${pairs.onlyInB[pairs.onlyInB.length - 1]}` : ""}. ` : ""}
          Pages are compared by position, page 1 with page 1.
        </Alert>
      ) : null}
      {pairs.common > MAX_COMPARED_PAGES ? <Alert tone="warning">Only the first {MAX_COMPARED_PAGES} pages are compared.</Alert> : null}

      <SegmentedControl<Sensitivity>
        label="Sensitivity"
        value={sensitivity}
        onValueChange={(s) => (setSensitivity(s), setSelected(null))}
        options={[
          { value: "any", label: "Any change" },
          { value: "normal", label: "Normal" },
          { value: "faint", label: "Ignore faint changes" },
        ]}
      />

      {overview.status === "scanning" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <RunProgress label={`Comparing page ${Math.min(overview.done + 1, overview.total)} of ${overview.total}`} done={overview.done} total={overview.total} />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={stop}>
            Stop
          </Button>
        </div>
      ) : null}
      {overview.status === "failed" && overview.error ? <Alert tone="error">{overview.error}</Alert> : null}

      {overview.changes.length > 0 ? (
        <>
          <p className="text-sm" aria-live="polite">
            <strong>{changedCount}</strong> of {overview.changes.length} compared page{overview.changes.length === 1 ? "" : "s"} look different.
          </p>
          <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto border border-border bg-muted/20 p-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8" role="group" aria-label="Pages">
            {overview.changes.map((c) => (
              <button
                key={c.page}
                type="button"
                onClick={() => setSelected(c.page)}
                aria-pressed={selected === c.page}
                className={cn(
                  "flex flex-col border p-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  c.changed ? "border-danger bg-danger/10" : "border-border bg-card",
                  selected === c.page && "outline outline-2 outline-foreground",
                )}
              >
                <span className="font-mono">Page {c.page}</span>
                <span className="text-muted-foreground">{c.sizeDiffers ? "size differs" : c.changed ? percentText(c.percent) : "same"}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {selected !== null && overview.changes.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium" aria-live="polite">
              Page {selected}
              {view ? ` · ${percentText(view.percent)} differs` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={changedCount === 0} onClick={() => go(-1)}>
                Previous change
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={changedCount === 0} onClick={() => go(1)}>
                Next change
              </Button>
              <SegmentedControl<"difference" | "side"> label="View" value={mode} onValueChange={setMode} options={[{ value: "difference", label: "Difference" }, { value: "side", label: "Side by side" }]} />
            </div>
          </div>
          {view?.sizeDiffers ? <Alert tone="warning">These two pages have different proportions, so B was stretched to fit A. Most of the page will look different.</Alert> : null}
          {viewError ? <Alert tone="error">{viewError}</Alert> : null}
          {!view && !viewError ? <p className="text-sm text-muted-foreground">Drawing page {selected}…</p> : null}
          {view && mode === "difference" ? <DifferenceCanvas view={view} /> : null}
          {view && mode === "side" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { label: "A", url: view.aUrl },
                { label: "B", url: view.bUrl },
              ].map((p) => (
                <figure key={p.label} className="flex flex-col gap-1.5">
                  <figcaption className="label-plate">{p.label}</figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it */}
                  <img src={p.url} alt={`Page ${selected} of ${p.label}`} className="h-auto w-full border border-foreground bg-card" />
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Text changes                                                                                     */
/* ----------------------------------------------------------------------------------------------- */

const ROW_LIMIT = 300;

function Cell({ side, row }: { side: "left" | "right"; row: CompareRow }) {
  const line = row[side];
  if (!line) return <div className="bg-muted/30" aria-hidden />;
  const segments = row.inline?.[side];
  const removed = side === "left";
  return (
    <div className={cn("min-w-0 px-3 py-1.5 text-sm", line.changed && (removed ? "bg-danger/10" : "bg-success/10"))}>
      <span className="mr-2 font-mono text-xs text-muted-foreground">
        {side === "left" ? "A" : "B"} p.{line.page}
      </span>
      {line.changed ? <span className="sr-only">{removed ? "Removed or changed: " : "Added or changed: "}</span> : null}
      <span className="break-words">
        {segments
          ? segments.map((s, i) => (
              <span key={i} className={cn(s.type === "removed" && "bg-danger/25 line-through decoration-danger/60", s.type === "added" && "bg-success/25 font-semibold")}>
                {s.value}
              </span>
            ))
          : line.text}
      </span>
    </div>
  );
}

function TextTab({ a, b, readA, readB }: { a: PdfSource; b: PdfSource; readA: TextRead; readB: TextRead }) {
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [limit, setLimit] = useState(ROW_LIMIT);
  const ready = readA.status === "done" && readB.status === "done";

  const comparison = useMemo(() => (ready ? compareText(readA.pages, readB.pages, { ignoreCase, ignoreWhitespace }) : null), [ready, readA.pages, readB.pages, ignoreCase, ignoreWhitespace]);
  const items = useMemo(() => (comparison ? (onlyChanges ? collapseRows(comparison.rows, 2) : comparison.rows.map((row, index) => ({ kind: "row" as const, row, index }))) : []), [comparison, onlyChanges]);
  const reading = [readA, readB].filter((r) => r.status === "reading");
  const failed = [readA, readB].find((r) => r.status === "failed");

  return (
    <div className="flex flex-col gap-4">
      {reading.length > 0 ? <RunProgress label="Reading the text" done={readA.done + readB.done} total={Math.max(1, readA.total + readB.total)} /> : null}
      {failed?.error ? <Alert tone="error">{failed.error}</Alert> : null}
      {ready && looksScanned(readA.pages) && looksScanned(readB.pages) ? (
        <Alert tone="warning">Neither file has text that can be read: they look like scans, and there is no OCR. Open Page pictures to compare how the pages look.</Alert>
      ) : ready && (looksScanned(readA.pages) || looksScanned(readB.pages)) ? (
        <Alert tone="warning">One of the files has no readable text (it looks like a scan), so every line of the other file will show as a change. Page pictures still work.</Alert>
      ) : null}
      {ready && (readA.truncated || readB.truncated) ? <Alert tone="warning">One of the files is very long, so only the first part of its text was compared.</Alert> : null}

      {comparison ? (
        <>
          <StatGrid>
            <Stat label="Lines removed or changed in A" value={<span className="text-danger">{formatInt(comparison.removedLines)}</span>} />
            <Stat label="Lines added or changed in B" value={<span className="text-success">{formatInt(comparison.addedLines)}</span>} />
            <Stat label="Pages changed in A" value={comparison.changedPagesA.length} />
            <Stat label="Pages changed in B" value={comparison.changedPagesB.length} />
          </StatGrid>
          {comparison.identical ? <Alert tone="success">The text of the two files is identical. Open Page pictures to check for changes in images, layout or colour.</Alert> : null}
          {!comparison.identical ? (
            <p className="text-sm text-muted-foreground">
              Changed pages in A: {comparison.changedPagesA.join(", ") || "none"}. In B: {comparison.changedPagesB.join(", ") || "none"}.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Toggle label="Ignore case" checked={ignoreCase} onCheckedChange={(v) => (setIgnoreCase(v), setLimit(ROW_LIMIT))} />
            <Toggle label="Ignore extra spaces" checked={ignoreWhitespace} onCheckedChange={(v) => (setIgnoreWhitespace(v), setLimit(ROW_LIMIT))} />
            <Toggle label="Hide unchanged text" checked={onlyChanges} onCheckedChange={(v) => (setOnlyChanges(v), setLimit(ROW_LIMIT))} />
            <CopyButton text={textReport(comparison, { a: a.file.name, b: b.file.name })} label="Copy list of changes" />
          </div>

          {!comparison.identical ? (
            <div className="flex flex-col gap-px border border-foreground bg-border" role="list" aria-label="Changes">
              {items.slice(0, limit).map((item) =>
                item.kind === "gap" ? (
                  <div key={`gap-${item.from}`} role="listitem" className="bg-muted/40 px-3 py-1 text-center text-xs text-muted-foreground">
                    {item.count} unchanged line{item.count === 1 ? "" : "s"}
                  </div>
                ) : (
                  <div key={item.index} role="listitem" className="grid gap-px bg-border md:grid-cols-2">
                    <div className="bg-card">
                      <Cell side="left" row={item.row} />
                    </div>
                    <div className="bg-card">
                      <Cell side="right" row={item.row} />
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : null}
          {items.length > limit ? (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLimit((l) => l + ROW_LIMIT)}>
              Show more ({items.length - limit} left)
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Tool                                                                                             */
/* ----------------------------------------------------------------------------------------------- */

type Tab = "text" | "pictures";

export default function Tool() {
  const pdfA = usePdfSource();
  const pdfB = usePdfSource();
  const [tab, setTab] = useState<Tab>("text");
  const a = pdfA.source;
  const b = pdfB.source;
  const readA = useDocumentText(a);
  const readB = useDocumentText(b);

  const slot = (letter: "A" | "B", pdf: typeof pdfA) => (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="label-plate">
        {letter === "A" ? "A · original" : "B · new version"}
      </p>
      {pdf.source ? <PdfSourceCard source={pdf.source} onRemove={pdf.clear} /> : <PdfDrop onFile={(f) => void pdf.load(f)} onReject={pdf.setError} loading={pdf.loading} />}
      {pdf.error ? <Alert tone="error">{pdf.error}</Alert> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        {slot("A", pdfA)}
        {slot("B", pdfB)}
      </div>

      {a && b ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Tab> label="Compare" value={tab} onValueChange={setTab} options={[{ value: "text", label: "Text changes" }, { value: "pictures", label: "Page pictures" }]} />
            {tab === "text" && readA.status === "done" && readB.status === "done" ? <Badge tone="neutral">{formatInt(a.info.pageCount)} and {formatInt(b.info.pageCount)} pages</Badge> : null}
          </div>
          {tab === "text" ? <TextTab a={a} b={b} readA={readA} readB={readB} /> : <PicturesTab key={`${a.file.name}-${a.file.size}-${b.file.name}-${b.file.size}`} a={a} b={b} />}
          <p className="text-xs text-muted-foreground">Text is read up to {formatInt(TEXT_LIMITS.maxPages)} pages per file. Both files stay in this tab; nothing is uploaded.</p>
        </>
      ) : (
        <Alert tone="info">Drop the original PDF in A and the new version in B to see what changed.</Alert>
      )}
    </div>
  );
}
