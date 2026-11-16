"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Field, Input, Select, SegmentedControl, baseName } from "@toolwright/ui";
import { parsePageRanges } from "@toolwright/core/pdf";
import { MM, readPageSizes, resizePdf, resizePlacement, SHEET_NAMES, SHEET_SIZES, targetSize, type Orientation, type ResizeFit, type ResizeResult, type SheetSizeId, type Size } from "@toolwright/core/pdf-layout";
import { DownloadResult, JobError, PdfDrop, PdfLoadStatus, PdfSourceCard, RunButton, useJob, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { usePagePreview } from "../../shared/pdf-page-preview";
import { NumberField, num } from "../../shared/number-field";
import { errorMessage } from "../../shared/format";

type Paper = SheetSizeId | "custom";
const PAPERS: Paper[] = ["a4", "letter", "legal", "a3", "a5", "tabloid", "custom"];
const FITS: { value: ResizeFit; label: string; hint: string }[] = [
  { value: "fit", label: "Fit", hint: "Scaled to fit the new page. Nothing is cut off." },
  { value: "fill", label: "Fill", hint: "Scaled to cover the new page. A little may be trimmed off two edges." },
  { value: "none", label: "Keep size", hint: "Not scaled, just centred on the new page." },
];

const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;
const describe = (s: Size) => `${round(s.width / MM, 0)} × ${round(s.height / MM, 0)} mm (${round(s.width / 72, 2)} × ${round(s.height / 72, 2)} in)`;

/** The name of a standard size a page matches either way round, if any. */
function sizeName(s: Size): string | null {
  for (const [id, p] of Object.entries(SHEET_SIZES) as [SheetSizeId, Size][]) {
    const close = (a: number, b: number) => Math.abs(a - b) < 2;
    if ((close(s.width, p.width) && close(s.height, p.height)) || (close(s.width, p.height) && close(s.height, p.width))) return SHEET_NAMES[id];
  }
  return null;
}

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={pdf.clear} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <PdfLoadStatus pdf={pdf} />
      {source ? <Resizer key={`${source.file.name}:${source.file.size}:${source.file.lastModified}`} source={source} /> : null}
    </div>
  );
}

function Resizer({ source }: { source: PdfSource }) {
  const [sizes, setSizes] = useState<Size[] | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>("a4");
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [customW, setCustomW] = useState("210");
  const [customH, setCustomH] = useState("297");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [fit, setFit] = useState<ResizeFit>("fit");
  const [margin, setMargin] = useState("0");
  const [scope, setScope] = useState<"all" | "pages">("all");
  const [pages, setPages] = useState("1");
  const [previewPage, setPreviewPage] = useState("1");
  const job = useJob<ResizeResult>();
  const { reset } = job;
  const pageCount = source.info.pageCount;

  useEffect(() => {
    let live = true;
    readPageSizes(source.bytes).then(
      (s) => {
        if (!live) return;
        setSizes(s);
        // Start from the other common size: Letter files usually need A4, and A4 files Letter.
        if (s[0] && sizeName(s[0]) === "A4") setPaper("letter");
      },
      (err) => live && setSizeError(errorMessage(err)),
    );
    return () => {
      live = false;
    };
  }, [source]);

  const perUnit = unit === "mm" ? MM : 72;
  const size: SheetSizeId | Size = paper === "custom" ? { width: num(customW) * perUnit, height: num(customH) * perUnit } : paper;
  const customBad = paper === "custom" && !(typeof size !== "string" && size.width >= 36 && size.height >= 36 && size.width <= 14400 && size.height <= 14400);
  const marginPt = num(margin) * MM;

  const pageIndexes = useMemo(() => {
    if (scope === "all") return { list: undefined, error: null };
    try {
      return { list: parsePageRanges(pages, pageCount), error: null };
    } catch (err) {
      return { list: undefined, error: errorMessage(err) };
    }
  }, [scope, pages, pageCount]);

  const index = Math.min(Math.max(Math.floor(num(previewPage)) || 1, 1), pageCount) - 1;
  const preview = usePagePreview(source.file, index);
  const shown = sizes?.[index];
  const target = shown && !customBad ? targetSize(shown, size, orientation) : null;
  const willChange = scope === "all" || (pageIndexes.list ?? []).includes(index);
  const placed = useMemo(() => {
    if (!shown || !target) return null;
    try {
      return { at: resizePlacement(shown, target, fit, marginPt), error: null };
    } catch (err) {
      return { at: null, error: errorMessage(err) };
    }
  }, [shown, target?.width, target?.height, fit, marginPt]); // eslint-disable-line react-hooks/exhaustive-deps -- target is rebuilt each render; its sides are the inputs

  useEffect(() => reset(), [paper, customW, customH, unit, orientation, fit, margin, scope, pages, reset]);

  const error = customBad ? "Enter a page size between 13 mm (0.5 in) and 5 m (200 in) on each side." : !(marginPt >= 0) ? "The margin must be zero or more." : (pageIndexes.error ?? placed?.error ?? null);
  const box = willChange && target ? target : shown;

  const run = () => job.run(() => resizePdf(source.bytes, { size, orientation, fit, margin: fit === "fit" ? marginPt : 0, pageIndexes: pageIndexes.list }));

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <NumberField label="Preview page" value={previewPage} onChange={setPreviewPage} min={1} max={pageCount} step={1} className="w-36" />
            {shown ? (
              <p className="pb-2 text-sm text-muted-foreground">
                Now {describe(shown)}
                {sizeName(shown) ? `, ${sizeName(shown)}` : ""}
              </p>
            ) : null}
          </div>
          {box && shown ? (
            <div className="mx-auto w-full" style={{ maxWidth: box.width >= box.height ? "36rem" : "24rem" }}>
              <div
                role="img"
                aria-label={willChange ? `Preview of page ${index + 1} resized. The white sheet is the new paper and the dashed outline is the content.` : `Preview of page ${index + 1}, which keeps its size.`}
                className="relative w-full overflow-hidden border border-foreground bg-white"
                style={{ aspectRatio: `${box.width} / ${box.height}` }}
              >
                {(() => {
                  const at = willChange && placed?.at ? placed.at : { x: 0, y: 0, width: shown.width, height: shown.height };
                  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
                  return (
                    <span
                      className="absolute grid place-items-center bg-muted outline outline-1 outline-dashed outline-foreground/40"
                      style={{ left: pct(at.x, box.width), top: pct(box.height - at.y - at.height, box.height), width: pct(at.width, box.width), height: pct(at.height, box.height) }}
                    >
                      {preview.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
                        <img src={preview.url} alt="" className="size-full object-fill" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{preview.failed ? "No preview available" : "Drawing page…"}</span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {willChange && target ? `New size: ${describe(target)}. The dashed outline is the content.` : "This page is not in the pages you chose, so it keeps its size."}
              </p>
            </div>
          ) : (
            <div className="grid aspect-[3/4] place-items-center border border-dashed border-border text-sm text-muted-foreground">{sizeError ?? "Reading the pages…"}</div>
          )}
        </div>

        <div className="flex flex-col gap-4 border border-border bg-card p-4">
          <Field label="New page size">
            {(id) => (
              <Select id={id} value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                {PAPERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "custom" ? "Custom size" : `${SHEET_NAMES[p]} (${describe(SHEET_SIZES[p]).split(" (")[0]})`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {paper === "custom" ? (
            <>
              <SegmentedControl<"mm" | "in">
                label="Unit"
                value={unit}
                onValueChange={(u) => {
                  const factor = u === "mm" ? 25.4 : 1 / 25.4;
                  setCustomW((w) => String(round(num(w) * factor, u === "mm" ? 0 : 2)));
                  setCustomH((h) => String(round(num(h) * factor, u === "mm" ? 0 : 2)));
                  setUnit(u);
                }}
                options={[
                  { value: "mm", label: "Millimetres" },
                  { value: "in", label: "Inches" },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Width" suffix={unit} value={customW} onChange={setCustomW} min={0} step={unit === "mm" ? 1 : 0.1} />
                <NumberField label="Height" suffix={unit} value={customH} onChange={setCustomH} min={0} step={unit === "mm" ? 1 : 0.1} />
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Orientation</span>
            <SegmentedControl<Orientation>
              label="Orientation"
              value={orientation}
              onValueChange={setOrientation}
              options={[
                { value: "auto", label: "As each page" },
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Content</span>
            <SegmentedControl<ResizeFit> label="Content" value={fit} onValueChange={setFit} options={FITS.map(({ value, label }) => ({ value, label }))} />
            <p className="text-xs text-muted-foreground">{FITS.find((f) => f.value === fit)?.hint}</p>
          </div>
          {fit === "fit" ? <NumberField label="Margin round the content" suffix="mm" value={margin} onChange={setMargin} min={0} step={1} /> : null}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Pages</span>
            <SegmentedControl<"all" | "pages">
              label="Pages"
              value={scope}
              onValueChange={setScope}
              options={[
                { value: "all", label: "All pages" },
                { value: "pages", label: "Selected pages" },
              ]}
            />
          </div>
          {scope === "pages" ? (
            <Field label="Pages to resize" hint={`For example 1-3, 5, 8-. This PDF has ${pageCount} pages.`}>
              {(id) => <Input id={id} mono value={pages} onChange={(e) => setPages(e.target.value)} />}
            </Field>
          ) : null}
        </div>
      </div>

      {fit === "fill" ? <Alert tone="info">Fill trims whatever reaches past the new page. The trimmed parts are hidden, not erased, so do not rely on this to remove private details.</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {sizeError ? <Alert tone="error">{sizeError}</Alert> : null}
      <RunButton busy={job.busy} disabled={!sizes || !!error} onClick={run}>
        Resize PDF
      </RunButton>
      <JobError error={job.error} />
      {job.result ? (
        <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-${paper === "custom" ? "resized" : paper}.pdf`} note={`${job.result.resized} page${job.result.resized === 1 ? "" : "s"} resized`} />
      ) : null}
    </>
  );
}
