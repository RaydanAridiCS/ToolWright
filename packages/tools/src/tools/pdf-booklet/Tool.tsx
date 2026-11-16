"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Field, Select, SegmentedControl, Toggle, baseName } from "@toolwright/ui";
import { bookletLayout, bookletPdf, MM, readPageSizes, SHEET_NAMES, type BookletResult, type SheetSizeId, type Size } from "@toolwright/core/pdf-layout";
import { DownloadResult, JobError, PdfDrop, PdfLoadStatus, PdfSourceCard, RunButton, useJob, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { useThumbnails } from "../../shared/pdf-thumbs";
import { SheetPager, SheetSidePreview } from "../../shared/pdf-sheet-preview";
import { NumberField, num } from "../../shared/number-field";
import { errorMessage } from "../../shared/format";

type Paper = "auto" | SheetSizeId;
const PAPERS: Paper[] = ["a4", "letter", "a3", "tabloid", "legal", "a5", "auto"];
const SECTIONS = [0, 8, 12, 16, 20, 24, 28, 32];

/** Letter where it is the usual paper; A4 everywhere else. */
function localPaper(): Paper {
  const lang = typeof navigator === "undefined" ? "" : navigator.language;
  return /^(en-(US|CA|PH)|es-(MX|US)|fr-CA)$/i.test(lang) ? "letter" : "a4";
}

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={pdf.clear} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <PdfLoadStatus pdf={pdf} />
      {source ? <Booklet key={`${source.file.name}:${source.file.size}:${source.file.lastModified}`} source={source} /> : null}
    </div>
  );
}

function Booklet({ source }: { source: PdfSource }) {
  const [sizes, setSizes] = useState<Size[] | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const { store } = useThumbnails(source.file, 360);
  const [paper, setPaper] = useState<Paper>("a4");
  const [binding, setBinding] = useState<"left" | "right">("left");
  const [blanks, setBlanks] = useState<"end" | "before-back">("end");
  const [section, setSection] = useState(0);
  const [margin, setMargin] = useState("5");
  const [gutter, setGutter] = useState("4");
  const [keepAnnotations, setKeepAnnotations] = useState(true);
  const [sheetIndex, setSheetIndex] = useState(0);
  const job = useJob<BookletResult>();
  const { reset } = job;

  // The usual paper for the reader's language, read after mount (the server has no navigator).
  useEffect(() => setPaper(localPaper()), []);

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

  const options = useMemo(() => ({ sheet: paper, binding, blanks, section, margin: num(margin) * MM, gutter: num(gutter) * MM }), [paper, binding, blanks, section, margin, gutter]);
  const plan = useMemo(() => {
    if (!sizes) return null;
    try {
      return { layout: bookletLayout(sizes, options), error: null };
    } catch (err) {
      return { layout: null, error: errorMessage(err) };
    }
  }, [sizes, options]);
  const layout = plan?.layout ?? null;
  const sheets = layout ? layout.sides.length / 2 : 0;
  const index = Math.min(sheetIndex, Math.max(0, sheets - 1));
  const front = layout?.sides[index * 2];
  const back = layout?.sides[index * 2 + 1];

  useEffect(() => reset(), [options, keepAnnotations, reset]);

  const pages = source.info.pageCount;
  const tooLong = section === 0 && pages > 60;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex flex-col gap-3">
          {layout && front && back ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <SheetSidePreview store={store} sheet={layout.sheet} side={front} label={`Sheet ${index + 1}, front`} />
                <SheetSidePreview store={store} sheet={layout.sheet} side={back} label={`Sheet ${index + 1}, back`} />
              </div>
              {sheets > 1 ? (
                <div className="flex justify-center">
                  <SheetPager index={index} count={sheets} onChange={setSheetIndex} />
                </div>
              ) : null}
              <p className="text-center text-sm text-muted-foreground" role="status">
                {pages} page{pages === 1 ? "" : "s"} on {sheets} sheet{sheets === 1 ? "" : "s"} of paper
                {layout.blanks ? `, with ${layout.blanks} blank page${layout.blanks === 1 ? "" : "s"} added` : ""}
                {layout.sections > 1 ? `, in ${layout.sections} sections` : ""}.
              </p>
            </>
          ) : (
            <div className="grid aspect-[2/1] place-items-center border border-dashed border-border text-sm text-muted-foreground">{plan?.error ?? sizeError ?? "Reading the pages…"}</div>
          )}
        </div>

        <div className="flex flex-col gap-4 border border-border bg-card p-4">
          <Field label="Paper you print on">
            {(id) => (
              <Select id={id} value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                {PAPERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "auto" ? "Two pages side by side, full size" : `${SHEET_NAMES[p]}, landscape`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Binding</span>
            <SegmentedControl<"left" | "right">
              label="Binding"
              value={binding}
              onValueChange={setBinding}
              options={[
                { value: "left", label: "Left" },
                { value: "right", label: "Right (Arabic, Hebrew, Japanese)" },
              ]}
            />
          </div>
          <Field label="Blank pages go">
            {(id) => (
              <Select id={id} value={blanks} onChange={(e) => setBlanks(e.target.value as "end" | "before-back")}>
                <option value="end">At the end</option>
                <option value="before-back">Before the back cover</option>
              </Select>
            )}
          </Field>
          <Field label="Sections" hint="Thick booklets fold better in sections that are stacked and bound together.">
            {(id) => (
              <Select id={id} value={String(section)} onChange={(e) => (setSection(Number(e.target.value)), setSheetIndex(0))}>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? "One booklet" : `Every ${s} pages (${s / 4} sheets)`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Margin" suffix="mm" value={margin} onChange={setMargin} min={0} step={1} />
            <NumberField label="Space at the fold" suffix="mm" value={gutter} onChange={setGutter} min={0} step={1} />
          </div>
          <Toggle label="Keep form entries and comments" hint="Draws filled-in fields, stamps and notes into the pages so they print." checked={keepAnnotations} onCheckedChange={setKeepAnnotations} />
        </div>
      </div>

      <Alert tone="info">
        To print: choose both sides (duplex) and <strong>flip on short edge</strong>. Fold the stack in half{layout && layout.sections > 1 ? ", one section at a time," : ""} and staple along the fold.
      </Alert>
      {tooLong ? <Alert tone="warning">{pages} pages make a thick stack that is hard to fold. Sections of 16 or 20 pages fold more neatly.</Alert> : null}
      {sizeError ? <Alert tone="error">{sizeError}</Alert> : null}
      <RunButton busy={job.busy} disabled={!layout} onClick={() => job.run(() => bookletPdf(source.bytes, { ...options, keepAnnotations }))}>
        Make booklet
      </RunButton>
      <JobError error={job.error} />
      {job.result ? (
        <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-booklet.pdf`} note={`${job.result.sheets} sheet${job.result.sheets === 1 ? "" : "s"}, ${job.result.sheets * 2} sides`} />
      ) : null}
    </>
  );
}
