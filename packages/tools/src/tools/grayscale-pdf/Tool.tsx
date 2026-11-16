"use client";

import { useMemo, useState } from "react";
import { Alert, SegmentedControl } from "@toolwright/ui";
import { grayscalePdf, type GrayImageCodec, type GrayMode, type GrayscaleReport } from "@toolwright/core/pdf-grayscale";
import { DownloadResult, JobError, PdfBatchDrop, PdfLoadStatus, PdfSourceList, RunButton, RunProgress, runOnAll, useJob, usePdfSource, type BatchOutput } from "../../shared/pdf-ui";
import { usePagePreview } from "../../shared/pdf-page-preview";
import { NumberField, num } from "../../shared/number-field";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** JPEGs are read and written with the browser's own canvas, so nothing leaves the tab. */
const canvasCodec: GrayImageCodec = {
  async decodeJpeg(data) {
    const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: "image/jpeg" }), { imageOrientation: "none" });
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  },
  async encodeJpeg(rgba, width, height, quality) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return new Uint8Array(await blob.arrayBuffer());
  },
};

interface Converted extends BatchOutput {
  report: GrayscaleReport;
  /** The single result as a file, for the after preview. */
  file: File | null;
}

const EMPTY: GrayscaleReport = { colors: 0, images: 0, shadings: 0, kept: { jpeg: 0, jpeg2000: 0, mesh: 0, other: 0 } };

export default function Tool() {
  const pdf = usePdfSource();
  const [mode, setMode] = useState<GrayMode>("gray");
  const [threshold, setThreshold] = useState("50");
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const job = useJob<Converted>();
  const source = pdf.source;

  const t = num(threshold);
  const thresholdBad = mode === "bw" && !(t >= 1 && t <= 99);

  const run = () =>
    job.run(async () => {
      const report: GrayscaleReport = { ...EMPTY, kept: { ...EMPTY.kept } };
      const total = pdf.all.length;
      try {
        const out = await runOnAll(pdf.all, mode === "bw" ? "black-white" : "grayscale", async (s) => {
          const r = await grayscalePdf(s.bytes, {
            mode,
            threshold: t / 100,
            codec: canvasCodec,
            onProgress: (done, of) => of > 0 && setProgress({ label: `${total > 1 ? `${s.file.name}: ` : ""}photo ${Math.min(done + 1, of)} of ${of}`, done, total: of }),
          });
          report.colors += r.colors;
          report.images += r.images;
          report.shadings += r.shadings;
          for (const k of Object.keys(report.kept) as (keyof GrayscaleReport["kept"])[]) report.kept[k] += r.kept[k];
          return r.data;
        });
        const file = total === 1 ? new File([out.data as Uint8Array<ArrayBuffer>], out.filename, { type: "application/pdf" }) : null;
        return { ...out, report, file };
      } finally {
        setProgress(null);
      }
    });

  const result = job.result;
  const kept = result ? result.report.kept : null;
  const keptTotal = kept ? kept.jpeg + kept.jpeg2000 + kept.mesh + kept.other : 0;

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceList sources={pdf.all} onRemove={(i) => (pdf.remove(i), job.reset())} /> : null}
      <PdfBatchDrop more={Boolean(source)} onFiles={(files) => (job.reset(), void pdf.loadMany(files))} onReject={pdf.setError} loading={pdf.loading} />
      <PdfLoadStatus pdf={pdf} />

      {source ? (
        <>
          <div className="flex flex-col gap-4 border border-border bg-card p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Convert to</span>
              <SegmentedControl<GrayMode>
                label="Convert to"
                value={mode}
                onValueChange={(m) => (setMode(m), job.reset())}
                options={[
                  { value: "gray", label: "Shades of gray" },
                  { value: "bw", label: "Black and white" },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {mode === "gray" ? "Every colour becomes the gray of the same lightness. Text and drawings stay sharp." : "Every colour becomes pure black or white, for faxes, stencils and the smallest scans. Light colours such as highlights may disappear."}
              </p>
            </div>
            {mode === "bw" ? (
              <NumberField label="Lighter than this turns white" suffix="%" value={threshold} onChange={(v) => (setThreshold(v), job.reset())} min={1} max={99} step={5} hint="50% splits colours in the middle. Raise it to keep pale colours as black." className="max-w-64" />
            ) : null}
          </div>

          {thresholdBad ? <Alert tone="error">Choose a value between 1% and 99%.</Alert> : null}
          <RunButton busy={job.busy} disabled={thresholdBad} onClick={run}>
            {pdf.all.length > 1 ? `Convert ${pdf.all.length} PDFs` : mode === "bw" ? "Convert to black and white" : "Convert to grayscale"}
          </RunButton>
          {job.busy && progress ? <RunProgress label={progress.label} done={progress.done} total={progress.total} /> : null}
        </>
      ) : null}

      <JobError error={job.error} />
      {result ? (
        <div className="flex flex-col gap-3">
          <DownloadResult data={result.data} filename={result.filename} mime={result.mime} note={result.note ?? `${plural(result.report.colors, "colour")}, ${plural(result.report.images, "picture")}`} />
          <p className="text-sm" aria-live="polite">
            Changed {plural(result.report.colors, "colour setting")}, {plural(result.report.images, "picture")} and {plural(result.report.shadings, "colour blend")}.
          </p>
          {kept && keptTotal > 0 ? (
            <Alert tone="warning" title={`${plural(keptTotal, "item")} kept ${keptTotal === 1 ? "its" : "their"} colour`}>
              {[
                kept.jpeg ? `${plural(kept.jpeg, "photo")} this browser could not read` : null,
                kept.jpeg2000 ? `${plural(kept.jpeg2000, "JPEG 2000 picture")}` : null,
                kept.mesh ? `${plural(kept.mesh, "mesh colour blend")}` : null,
                kept.other ? `${plural(kept.other, "item")} in a format this tool cannot redraw` : null,
              ]
                .filter(Boolean)
                .join(", ")}
              . Check the preview before you send the file.
            </Alert>
          ) : null}
          {result.file && source ? <BeforeAfter before={source.file} after={result.file} pageCount={source.info.pageCount} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function BeforeAfter({ before, after, pageCount }: { before: File; after: File; pageCount: number }) {
  const [page, setPage] = useState("1");
  const index = Math.min(Math.max(Math.floor(num(page)) || 1, 1), pageCount) - 1;
  const a = usePagePreview(before, index, 520);
  const b = usePagePreview(after, index, 520);
  const shots = useMemo(
    () => [
      { label: "Before", shot: a },
      { label: "After", shot: b },
    ],
    [a, b],
  );
  return (
    <section aria-label="Before and after" className="flex flex-col gap-3 border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="label-plate">Before and after</p>
        {pageCount > 1 ? <NumberField label="Page" value={page} onChange={setPage} min={1} max={pageCount} step={1} className="w-28" /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {shots.map(({ label, shot }) => (
          <figure key={label} className="flex flex-col gap-1.5">
            <div className="grid min-h-48 place-items-center border border-border bg-muted p-2">
              {shot.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
                <img src={shot.url} alt={`Page ${index + 1}, ${label.toLowerCase()}`} className="max-h-[28rem] max-w-full border border-border bg-white object-contain" />
              ) : (
                <span className="text-sm text-muted-foreground">{shot.failed ? "No preview available" : "Drawing page…"}</span>
              )}
            </div>
            <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
