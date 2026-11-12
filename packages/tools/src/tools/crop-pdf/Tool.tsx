"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Field, Input, SegmentedControl, Toggle, baseName } from "@toolwright/ui";
import { parsePageRanges } from "@toolwright/core/pdf";
import { cropPdf, detectBlankMargins, fromPoints, pageDisplaySizes, toPoints, tooMuchCropped, type CropMargins, type CropUnit } from "@toolwright/core/crop-pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";
import { usePagePreview } from "../../shared/pdf-page-preview";
import { errorMessage } from "../../shared/format";

type Side = keyof CropMargins;
const SIDES: { side: Side; label: string }[] = [
  { side: "top", label: "Top" },
  { side: "right", label: "Right" },
  { side: "bottom", label: "Bottom" },
  { side: "left", label: "Left" },
];

const format = (points: number, unit: CropUnit) => String(Math.round(fromPoints(points, unit) * (unit === "pt" ? 10 : 100)) / (unit === "pt" ? 10 : 100));

async function measureBlankBorders(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot read the page picture.");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return detectBlankMargins(data, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}

export default function Tool() {
  const pdf = usePdfSource();
  const [unit, setUnit] = useState<CropUnit>("mm");
  const [values, setValues] = useState<Record<Side, string>>({ top: "0", right: "0", bottom: "0", left: "0" });
  const [scope, setScope] = useState<"all" | "pages">("all");
  const [pages, setPages] = useState("1");
  const [resizePage, setResizePage] = useState(true);
  const [previewPage, setPreviewPage] = useState(1);
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const job = useJob<Uint8Array>();
  const source = pdf.source;

  useEffect(() => {
    setPreviewPage(1);
    setSizes([]);
    setDetectNote(null);
    if (!source) return;
    let live = true;
    pageDisplaySizes(source.bytes).then(
      (s) => live && setSizes(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [source]);

  const pageIndex = Math.min(Math.max(previewPage, 1), source?.info.pageCount ?? 1) - 1;
  const preview = usePagePreview(source?.file ?? null, pageIndex);
  const size = sizes[pageIndex];

  const margins: CropMargins = useMemo(
    () => ({ top: toPoints(num(values.top), unit), right: toPoints(num(values.right), unit), bottom: toPoints(num(values.bottom), unit), left: toPoints(num(values.left), unit) }),
    [values, unit],
  );
  const invalid = SIDES.some(({ side }) => !Number.isFinite(margins[side]) || margins[side] < 0);
  const nothing = !invalid && margins.top + margins.right + margins.bottom + margins.left === 0;
  const tooMuch = !invalid && size ? tooMuchCropped(size, margins) : false;
  const percent = (side: Side) => (size ? Math.min(100, Math.max(0, (margins[side] / (side === "left" || side === "right" ? size.width : size.height)) * 100)) : 0);

  const changeValue = (side: Side, value: string) => {
    setValues((v) => ({ ...v, [side]: value }));
    job.reset();
    setDetectNote(null);
  };

  const changeUnit = (next: CropUnit) => {
    setValues((v) => {
      const out = { ...v };
      for (const { side } of SIDES) out[side] = format(toPoints(num(v[side]) || 0, unit), next);
      return out;
    });
    setUnit(next);
    job.reset();
  };

  const detect = async () => {
    if (!preview.blob || !size) return;
    setDetecting(true);
    setDetectNote(null);
    try {
      const found = await measureBlankBorders(preview.blob);
      if (!found) {
        setDetectNote("This page looks blank, so there is nothing to detect.");
        return;
      }
      setValues({
        top: format(found.top * size.height, unit),
        right: format(found.right * size.width, unit),
        bottom: format(found.bottom * size.height, unit),
        left: format(found.left * size.width, unit),
      });
      setDetectNote(`Measured from page ${pageIndex + 1}. Check the preview, and the other pages, before you crop all of them.`);
      job.reset();
    } catch (err) {
      setDetectNote(errorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  const run = () =>
    job.run(() => cropPdf(source!.bytes, { margins, resizePage, pageIndexes: scope === "pages" ? parsePageRanges(pages, source!.info.pageCount) : undefined }));

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <SegmentedControl
              label="Unit"
              value={unit}
              onValueChange={changeUnit}
              options={[
                { value: "mm", label: "Millimetres" },
                { value: "in", label: "Inches" },
                { value: "pt", label: "Points" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              {SIDES.map(({ side, label }) => (
                <NumberField key={side} label={`${label} margin`} suffix={unit} value={values[side]} onChange={(v) => changeValue(side, v)} min={0} step={unit === "in" ? 0.05 : unit === "mm" ? 1 : 5} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" disabled={!preview.blob || !size || detecting} onClick={detect}>
                {detecting ? "Measuring…" : "Detect blank borders"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => (setValues({ top: "0", right: "0", bottom: "0", left: "0" }), setDetectNote(null), job.reset())}>
                Reset margins
              </Button>
            </div>
            {detectNote ? (
              <p className="text-sm text-muted-foreground" role="status">
                {detectNote}
              </p>
            ) : null}
            <SegmentedControl
              label="Pages"
              value={scope}
              onValueChange={(s) => (setScope(s), job.reset())}
              options={[
                { value: "all", label: "All pages" },
                { value: "pages", label: "Selected pages" },
              ]}
            />
            {scope === "pages" ? (
              <Field label="Pages to crop" hint={`For example 1-3, 5, 8-. This PDF has ${source.info.pageCount} pages.`}>
                {(id) => <Input id={id} mono value={pages} onChange={(e) => (setPages(e.target.value), job.reset())} />}
              </Field>
            ) : null}
            <Toggle label="Also make the page itself smaller" hint="Turn this off to keep the original page size and only hide the trimmed edges." checked={resizePage} onCheckedChange={(v) => (setResizePage(v), job.reset())} />
          </div>

          <div className="flex flex-col gap-3">
            <NumberField label="Preview page" value={String(previewPage)} onChange={(v) => setPreviewPage(Math.floor(num(v)) || 1)} min={1} max={source.info.pageCount} step={1} />
            <div
              role="img"
              aria-label={`Preview of page ${pageIndex + 1}. The parts that will be removed are shaded.`}
              className="relative w-full overflow-hidden border border-foreground bg-muted"
              style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "3 / 4" }}
            >
              {preview.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
                <img src={preview.url} alt="" className="absolute inset-0 size-full object-fill" />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{preview.failed ? "No preview available" : "Drawing page…"}</span>
              )}
              {size ? (
                <>
                  <span aria-hidden className="absolute inset-x-0 top-0 bg-foreground/40" style={{ height: `${percent("top")}%` }} />
                  <span aria-hidden className="absolute inset-x-0 bottom-0 bg-foreground/40" style={{ height: `${percent("bottom")}%` }} />
                  <span aria-hidden className="absolute left-0 bg-foreground/40" style={{ width: `${percent("left")}%`, top: `${percent("top")}%`, bottom: `${percent("bottom")}%` }} />
                  <span aria-hidden className="absolute right-0 bg-foreground/40" style={{ width: `${percent("right")}%`, top: `${percent("top")}%`, bottom: `${percent("bottom")}%` }} />
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {size ? `Page ${pageIndex + 1} is ${format(size.width, unit)} × ${format(size.height, unit)} ${unit}. Shaded edges are removed.` : "Shaded edges are removed."}
            </p>
          </div>
        </div>
      ) : null}

      {source ? (
        <>
          <Alert tone="info">Cropping hides the parts you trim; it does not erase them. They stay inside the file, so do not use it to hide private information.</Alert>
          {invalid ? <Alert tone="error">Margins must be numbers that are zero or more.</Alert> : null}
          {tooMuch ? <Alert tone="warning">These margins leave almost nothing of the page. Trim less.</Alert> : null}
          <RunButton busy={job.busy} disabled={invalid || nothing || tooMuch} onClick={run}>
            Crop PDF
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-cropped.pdf`} /> : null}
    </div>
  );
}
