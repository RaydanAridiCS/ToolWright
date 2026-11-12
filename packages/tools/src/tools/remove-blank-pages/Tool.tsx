"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, SegmentedControl, baseName } from "@toolwright/ui";
import { formatPageRanges } from "@toolwright/core/pdf";
import { inkRatio, isBlank, pagesToRemove, removeBlankPages, type BlankSensitivity } from "@toolwright/core/remove-blank-pages";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, RunProgress, useJob, usePdfSource } from "../../shared/pdf-ui";
import { createThumbnailer } from "../../shared/pdf-raster";
import { errorMessage } from "../../shared/format";

const SCAN_SIDE = 500;
const MAX_PAGES = 1000;

interface Scan {
  status: "idle" | "scanning" | "done" | "stopped" | "failed";
  ratios: number[];
  urls: string[];
  done: number;
  total: number;
  error?: string;
}

const IDLE: Scan = { status: "idle", ratios: [], urls: [], done: 0, total: 0 };

/** Draws every page small, one after another, and measures how much of each is ink. Stops when `stop()` is called. */
function useBlankScan(file: File | null, pageCount: number) {
  const [scan, setScan] = useState<Scan>(IDLE);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!file) return;
    if (pageCount > MAX_PAGES) {
      setScan({ ...IDLE, status: "failed", error: `This PDF has ${pageCount} pages. Checking is limited to ${MAX_PAGES} pages; split it first.` });
      return;
    }
    let cancelled = false;
    stopRef.current = false;
    const urls: string[] = [];
    const ratios: number[] = [];
    setScan({ status: "scanning", ratios: [], urls: [], done: 0, total: pageCount });

    (async () => {
      const thumbnailer = await createThumbnailer(file, SCAN_SIDE);
      const canvas = document.createElement("canvas");
      try {
        for (let i = 0; i < pageCount && !cancelled && !stopRef.current; i++) {
          const blob = await thumbnailer.render(i);
          const bitmap = await createImageBitmap(blob);
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("This browser cannot read the page pictures.");
          context.drawImage(bitmap, 0, 0);
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          bitmap.close();
          ratios.push(inkRatio(data, canvas.width, canvas.height));
          urls.push(URL.createObjectURL(blob));
          if (!cancelled) setScan({ status: "scanning", ratios: [...ratios], urls: [...urls], done: ratios.length, total: pageCount });
        }
        if (!cancelled) setScan({ status: stopRef.current && ratios.length < pageCount ? "stopped" : "done", ratios: [...ratios], urls: [...urls], done: ratios.length, total: pageCount });
      } finally {
        canvas.width = canvas.height = 0;
        thumbnailer.dispose();
      }
    })().catch((err) => {
      if (!cancelled) setScan({ status: "failed", ratios: [...ratios], urls: [...urls], done: ratios.length, total: pageCount, error: errorMessage(err) });
    });

    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [file, pageCount]);

  return { scan, stop: () => (stopRef.current = true) };
}

const percent = (ratio: number) => (ratio === 0 ? "0%" : ratio < 0.00001 ? "<0.001%" : `${(ratio * 100).toFixed(ratio < 0.0001 ? 4 : ratio < 0.01 ? 3 : 1)}%`);

const SENSITIVITY_HINT: Record<BlankSensitivity, string> = {
  strict: "Only pages with nothing on them.",
  normal: "Also ignores dust and specks from scanning, and a page that holds only a page number.",
  loose: "Also ignores a page with only a footer line or a small stamp.",
};

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  const { scan, stop } = useBlankScan(source?.file ?? null, source?.info.pageCount ?? 0);
  const [sensitivity, setSensitivity] = useState<BlankSensitivity>("normal");
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map());
  const [show, setShow] = useState<"all" | "blank">("all");
  const job = useJob<Uint8Array>();
  const [removed, setRemoved] = useState<number[]>([]);

  useEffect(() => {
    setOverrides(new Map());
    setShow("all");
    setRemoved([]);
  }, [source]);

  const toRemove = useMemo(() => pagesToRemove(scan.ratios, sensitivity, overrides), [scan.ratios, sensitivity, overrides]);
  const removeSet = useMemo(() => new Set(toRemove), [toRemove]);
  const pageCount = source?.info.pageCount ?? 0;
  const everything = toRemove.length >= pageCount && pageCount > 0;

  const toggle = (index: number) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const automatic = isBlank(scan.ratios[index] as number, sensitivity);
      const current = next.get(index) ?? automatic;
      if (!current === automatic) next.delete(index);
      else next.set(index, !current);
      return next;
    });
    job.reset();
  };

  const run = () =>
    job.run(async () => {
      const out = await removeBlankPages(source!.bytes, toRemove);
      setRemoved(toRemove);
      return out;
    });

  const visible = scan.ratios.map((_, i) => i).filter((i) => show === "all" || removeSet.has(i));
  const scanning = scan.status === "scanning";

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          {scanning ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <RunProgress label={`Checking page ${Math.min(scan.done + 1, scan.total)} of ${scan.total}`} done={scan.done} total={scan.total} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={stop}>
                Stop checking
              </Button>
            </div>
          ) : null}
          {scan.status === "failed" && scan.error ? <Alert tone="error">{scan.error}</Alert> : null}
          {scan.status === "stopped" ? <Alert tone="warning">Stopped after {scan.done} of {scan.total} pages. The pages that were not checked will be kept.</Alert> : null}

          {scan.ratios.length > 0 ? (
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
              <SegmentedControl
                label="Sensitivity"
                value={sensitivity}
                onValueChange={(s) => (setSensitivity(s), job.reset())}
                options={[
                  { value: "strict", label: "Strict" },
                  { value: "normal", label: "Normal" },
                  { value: "loose", label: "Loose" },
                ]}
              />
              <p className="text-sm text-muted-foreground">{SENSITIVITY_HINT[sensitivity]}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm" aria-live="polite">
                  <strong>{toRemove.length}</strong> of {pageCount} page{pageCount === 1 ? "" : "s"} will be removed
                  {toRemove.length > 0 && toRemove.length <= 40 ? ` (${formatPageRanges(toRemove)})` : ""}.
                </p>
                <SegmentedControl
                  label="Show"
                  value={show}
                  onValueChange={setShow}
                  options={[
                    { value: "all", label: "All pages" },
                    { value: "blank", label: "Only pages to remove" },
                  ]}
                />
              </div>

              <div className="grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto border border-border bg-muted/20 p-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" role="group" aria-label="Pages">
                {visible.map((i) => {
                  const marked = removeSet.has(i);
                  const manual = overrides.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(i)}
                      aria-pressed={marked}
                      className={`flex flex-col gap-1.5 border p-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${marked ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-card text-foreground hover:border-foreground/40"}`}
                    >
                      <span className="flex w-full items-center justify-between gap-1">
                        <span className="font-mono">Page {i + 1}</span>
                        <span className="font-semibold">{marked ? "Remove" : "Keep"}</span>
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it */}
                      <img src={scan.urls[i]} alt="" loading="lazy" className="h-28 w-full border border-border bg-background object-contain" />
                      <span className="font-mono text-muted-foreground">
                        {percent(scan.ratios[i] as number)} content{manual ? " (your choice)" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              {visible.length === 0 && !scanning ? <p className="text-sm text-muted-foreground">No blank pages were found at this sensitivity. Try Loose, or switch to All pages and pick pages yourself.</p> : null}
            </div>
          ) : null}

          {everything ? <Alert tone="warning">Every page is marked for removal, which would leave an empty file. Keep at least one page.</Alert> : null}
          {scan.ratios.length > 0 ? (
            <RunButton busy={job.busy} disabled={scanning || toRemove.length === 0 || everything} onClick={run}>
              {toRemove.length === 0 ? "No pages to remove" : `Remove ${toRemove.length} page${toRemove.length === 1 ? "" : "s"}`}
            </RunButton>
          ) : null}
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? (
        <>
          <Alert tone="success">
            Removed {removed.length} page{removed.length === 1 ? "" : "s"} ({formatPageRanges(removed)}). The new file has {pageCount - removed.length} page{pageCount - removed.length === 1 ? "" : "s"}.
          </Alert>
          <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-no-blank-pages.pdf`} />
        </>
      ) : null}
    </div>
  );
}
