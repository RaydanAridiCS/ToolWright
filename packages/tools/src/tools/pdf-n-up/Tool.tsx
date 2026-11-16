"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Field, Select, SegmentedControl, Toggle, baseName } from "@toolwright/ui";
import { MM, NUP_COUNTS, nUpLayout, nUpPdf, readPageSizes, SHEET_NAMES, type NUpCount, type NUpOrder, type NUpResult, type Orientation, type SheetSizeId, type Size } from "@toolwright/core/pdf-layout";
import { DownloadResult, JobError, PdfDrop, PdfLoadStatus, PdfSourceCard, RunButton, useJob, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { useThumbnails } from "../../shared/pdf-thumbs";
import { SheetPager, SheetSidePreview } from "../../shared/pdf-sheet-preview";
import { NumberField, num } from "../../shared/number-field";
import { errorMessage } from "../../shared/format";

const PAPERS: ("auto" | SheetSizeId)[] = ["auto", "a4", "letter", "a3", "a5", "legal", "tabloid"];
const ORDERS: { value: NUpOrder; label: string }[] = [
  { value: "across", label: "Left to right, then down" },
  { value: "down", label: "Top to bottom, then across" },
  { value: "across-rtl", label: "Right to left, then down" },
];

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={pdf.clear} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <PdfLoadStatus pdf={pdf} />
      {source ? <NUp key={`${source.file.name}:${source.file.size}:${source.file.lastModified}`} source={source} /> : null}
    </div>
  );
}

function NUp({ source }: { source: PdfSource }) {
  const [sizes, setSizes] = useState<Size[] | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const { store } = useThumbnails(source.file, 360);
  const [perSheet, setPerSheet] = useState<NUpCount>(4);
  const [paper, setPaper] = useState<"auto" | SheetSizeId>("auto");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [order, setOrder] = useState<NUpOrder>("across");
  const [margin, setMargin] = useState("5");
  const [gap, setGap] = useState("3");
  const [autoTurn, setAutoTurn] = useState(true);
  const [border, setBorder] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [keepAnnotations, setKeepAnnotations] = useState(true);
  const [sheetIndex, setSheetIndex] = useState(0);
  const job = useJob<NUpResult>();
  const { reset } = job;

  useEffect(() => {
    let live = true;
    readPageSizes(source.bytes).then(
      (s) => live && setSizes(s),
      (err) => live && setSizeError(errorMessage(err)),
    );
    return () => {
      live = false;
    };
  }, [source]);

  const options = useMemo(
    () => ({ perSheet, sheet: paper, orientation, order, margin: num(margin) * MM, gap: num(gap) * MM, autoTurn, repeat }),
    [perSheet, paper, orientation, order, margin, gap, autoTurn, repeat],
  );
  const plan = useMemo(() => {
    if (!sizes) return null;
    try {
      return { layout: nUpLayout(sizes, options), error: null };
    } catch (err) {
      return { layout: null, error: errorMessage(err) };
    }
  }, [sizes, options]);
  const layout = plan?.layout ?? null;
  const count = layout?.sides.length ?? 0;
  const index = Math.min(sheetIndex, Math.max(0, count - 1));
  const side = layout?.sides[index];

  useEffect(() => reset(), [options, border, keepAnnotations, reset]);

  const pages = source.info.pageCount;
  const summary = !layout
    ? null
    : repeat
      ? `Each of the ${pages} page${pages === 1 ? "" : "s"} fills a sheet with ${perSheet} copies: ${count} sheet${count === 1 ? "" : "s"}.`
      : `${pages} page${pages === 1 ? "" : "s"} fit on ${count} sheet${count === 1 ? "" : "s"}${count < pages ? `, ${pages - count} fewer to print` : ""}.`;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex flex-col gap-3">
          {layout && side ? (
            <>
              <div className="mx-auto w-full" style={{ maxWidth: layout.sheet.width >= layout.sheet.height ? "40rem" : "28rem" }}>
                <SheetSidePreview store={store} sheet={layout.sheet} side={side} border={border} label={`Sheet ${index + 1}`} />
              </div>
              {count > 1 ? (
                <div className="flex justify-center">
                  <SheetPager index={index} count={count} onChange={setSheetIndex} />
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid aspect-[4/3] place-items-center border border-dashed border-border text-sm text-muted-foreground">{plan?.error ?? sizeError ?? "Reading the pages…"}</div>
          )}
          {summary ? (
            <p className="text-center text-sm text-muted-foreground" role="status">
              {summary}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 border border-border bg-card p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Pages per sheet</span>
            <SegmentedControl<string>
              label="Pages per sheet"
              value={String(perSheet)}
              onValueChange={(v) => (setPerSheet(Number(v) as NUpCount), setSheetIndex(0))}
              options={NUP_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
          <Field label="Paper size">
            {(id) => (
              <Select id={id} value={paper} onChange={(e) => setPaper(e.target.value as "auto" | SheetSizeId)}>
                {PAPERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "auto" ? "Same as the pages" : SHEET_NAMES[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Orientation</span>
            <SegmentedControl<Orientation>
              label="Orientation"
              value={orientation}
              onValueChange={setOrientation}
              options={[
                { value: "auto", label: "Best fit" },
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          </div>
          <Field label="Page order">
            {(id) => (
              <Select id={id} value={order} onChange={(e) => setOrder(e.target.value as NUpOrder)}>
                {ORDERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Margin" suffix="mm" value={margin} onChange={setMargin} min={0} step={1} />
            <NumberField label="Gap between pages" suffix="mm" value={gap} onChange={setGap} min={0} step={1} />
          </div>
          <Toggle label="Turn pages to fit" hint="Pages that fit their space better the other way round are turned." checked={autoTurn} onCheckedChange={setAutoTurn} />
          <Toggle label="Draw a border round each page" checked={border} onCheckedChange={setBorder} />
          <Toggle label="Repeat each page to fill the sheet" hint="For business cards, labels and flyers: copies of one page on every sheet." checked={repeat} onCheckedChange={(v) => (setRepeat(v), setSheetIndex(0))} />
          <Toggle label="Keep form entries and comments" hint="Draws filled-in fields, stamps and notes into the pages so they show on the sheets." checked={keepAnnotations} onCheckedChange={setKeepAnnotations} />
        </div>
      </div>

      {sizeError ? <Alert tone="error">{sizeError}</Alert> : null}
      <RunButton busy={job.busy} disabled={!layout} onClick={() => job.run(() => nUpPdf(source.bytes, { ...options, border, keepAnnotations }))}>
        Make {perSheet}-up PDF
      </RunButton>
      <JobError error={job.error} />
      {job.result ? <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-${perSheet}-up.pdf`} note={`${job.result.sheets} sheet${job.result.sheets === 1 ? "" : "s"}`} /> : null}
    </>
  );
}
