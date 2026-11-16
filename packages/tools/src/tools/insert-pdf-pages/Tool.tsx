"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Alert, Button, Field, Input, Select, SegmentedControl, baseName, cn } from "@toolwright/ui";
import { parsePageRanges } from "@toolwright/core/pdf";
import { cleanGaps, gapsEvery, insertPages, MAX_BLANKS_PER_GAP, type Gap, type InsertResult, type Insertion } from "@toolwright/core/pdf-insert";
import { SHEET_NAMES, SHEET_SIZES, type SheetSizeId } from "@toolwright/core/pdf-layout";
import { DownloadResult, JobError, PdfDrop, PdfLoadStatus, PdfSourceCard, RunButton, useJob, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { PageThumb, useThumbnails, type ThumbStore } from "../../shared/pdf-thumbs";
import { NumberField, num } from "../../shared/number-field";
import { errorMessage } from "../../shared/format";

type What = "blank" | "pdf";
type Where = "pick" | "every";
type BlankSize = "match" | SheetSizeId;
const BLANK_SIZES: BlankSize[] = ["match", "a4", "letter", "legal", "a3", "a5"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const gapName = (gap: Gap, pageCount: number) => (gap === 0 ? "before page 1" : gap === pageCount ? `after page ${gap}, at the end` : `after page ${gap}`);

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={pdf.clear} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <PdfLoadStatus pdf={pdf} />
      {source ? <Inserter key={`${source.file.name}:${source.file.size}:${source.file.lastModified}`} source={source} /> : null}
    </div>
  );
}

function Inserter({ source }: { source: PdfSource }) {
  const pageCount = source.info.pageCount;
  const [what, setWhat] = useState<What>("blank");
  const [count, setCount] = useState("1");
  const [blankSize, setBlankSize] = useState<BlankSize>("match");
  const [landscape, setLandscape] = useState(false);
  const [where, setWhere] = useState<Where>("pick");
  const [picked, setPicked] = useState<Gap[]>([pageCount]);
  const [every, setEvery] = useState("1");
  const [range, setRange] = useState("");
  const other = usePdfSource({ handoff: false });
  const thumbs = useThumbnails(source.file);
  const job = useJob<InsertResult>();
  const { reset } = job;

  const everyGaps = useMemo(() => {
    try {
      return { gaps: gapsEvery(pageCount, num(every)), error: null };
    } catch (err) {
      return { gaps: [], error: errorMessage(err) };
    }
  }, [pageCount, every]);
  const gaps = where === "pick" ? cleanGaps(picked, pageCount) : everyGaps.gaps;

  const otherPages = useMemo(() => {
    const total = other.source?.info.pageCount ?? 0;
    if (!range.trim()) return { list: Array.from({ length: total }, (_, i) => i), error: null };
    try {
      return { list: parsePageRanges(range, total), error: null };
    } catch (err) {
      return { list: [], error: errorMessage(err) };
    }
  }, [range, other.source]);

  const blanks = Math.floor(num(count));
  const blanksBad = !(blanks >= 1 && blanks <= MAX_BLANKS_PER_GAP);
  const size = blankSize === "match" ? undefined : landscape ? { width: SHEET_SIZES[blankSize].height, height: SHEET_SIZES[blankSize].width } : SHEET_SIZES[blankSize];
  const insertion: Insertion = what === "blank" ? { blank: { count: blanks, size } } : { pages: otherPages.list };
  const perGap = what === "blank" ? (blanksBad ? 0 : blanks) : otherPages.list.length;
  const added = perGap * gaps.length;

  useEffect(() => reset(), [what, count, blankSize, landscape, where, picked, every, range, other.source, reset]);

  const error =
    where === "every" && everyGaps.error
      ? everyGaps.error
      : what === "blank" && blanksBad
        ? `Insert between 1 and ${MAX_BLANKS_PER_GAP} blank pages at each spot.`
        : what === "pdf" && other.source && otherPages.error
          ? otherPages.error
          : null;
  const ready = !error && gaps.length > 0 && (what === "blank" || (!!other.source && otherPages.list.length > 0));

  const toggle = (gap: Gap) => {
    setWhere("pick");
    setPicked((current) => {
      const base = where === "pick" ? current : everyGaps.gaps;
      return base.includes(gap) ? base.filter((g) => g !== gap) : [...base, gap];
    });
  };

  const run = () =>
    job.run(() =>
      insertPages(
        { bytes: source.bytes, name: source.file.name, pageCount },
        { gaps, insertion, from: what === "pdf" && other.source ? { bytes: other.source.bytes, name: other.source.file.name } : undefined },
      ),
    );

  const insertLabel = what === "blank" ? (blanksBad ? "Blank" : blanks === 1 ? "Blank page" : `${blanks} blank pages`) : other.source ? plural(otherPages.list.length, "page") + ` of ${other.source.file.name}` : "Pages of the other PDF";

  return (
    <>
      <div className="grid gap-4 border border-border bg-card p-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Insert</span>
            <SegmentedControl<What>
              label="Insert"
              value={what}
              onValueChange={setWhat}
              options={[
                { value: "blank", label: "Blank pages" },
                { value: "pdf", label: "Pages from another PDF" },
              ]}
            />
          </div>
          {what === "blank" ? (
            <>
              <NumberField label="Blank pages at each spot" value={count} onChange={setCount} min={1} max={MAX_BLANKS_PER_GAP} step={1} className="max-w-48" />
              <Field label="Blank page size">
                {(id) => (
                  <Select id={id} value={blankSize} onChange={(e) => setBlankSize(e.target.value as BlankSize)}>
                    {BLANK_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s === "match" ? "Same as the page next to it" : SHEET_NAMES[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {blankSize !== "match" ? (
                <SegmentedControl<"portrait" | "landscape">
                  label="Blank page orientation"
                  value={landscape ? "landscape" : "portrait"}
                  onValueChange={(v) => setLandscape(v === "landscape")}
                  options={[
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                  ]}
                />
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {other.source ? <PdfSourceCard source={other.source} onRemove={other.clear} /> : <PdfDrop onFile={other.load} onReject={other.setError} loading={other.loading} />}
              <PdfLoadStatus pdf={other} />
              {other.source ? (
                <Field label="Pages to insert" hint={`Leave empty for all ${other.source.info.pageCount} pages, or type pages such as 1-3, 5.`}>
                  {(id) => <Input id={id} mono placeholder="All pages" value={range} aria-invalid={otherPages.error ? true : undefined} onChange={(e) => setRange(e.target.value)} />}
                </Field>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Where</span>
            <SegmentedControl<Where>
              label="Where"
              value={where}
              onValueChange={setWhere}
              options={[
                { value: "pick", label: "Pick spots" },
                { value: "every", label: "After every N pages" },
              ]}
            />
          </div>
          {where === "pick" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Click <Plus aria-hidden className="inline size-3.5" /> between the pages below to insert there. Click it again to take the insertion away.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" aria-pressed={picked.includes(0)} onClick={() => toggle(0)}>
                  At the start
                </Button>
                <Button variant="outline" size="sm" aria-pressed={picked.includes(pageCount)} onClick={() => toggle(pageCount)}>
                  At the end
                </Button>
                <Button variant="ghost" size="sm" disabled={picked.length === 0} onClick={() => setPicked([])}>
                  Clear spots
                </Button>
              </div>
            </div>
          ) : (
            <NumberField label="Insert after every" suffix={Math.floor(num(every)) === 1 ? "page" : "pages"} value={every} onChange={setEvery} min={1} max={Math.max(pageCount, 1)} step={1} className="max-w-48" />
          )}
        </div>
      </div>

      <p className="font-medium" aria-live="polite">
        {gaps.length === 0
          ? "Choose where to insert."
          : perGap === 0
            ? `${plural(gaps.length, "spot")} chosen.`
            : `Inserts ${plural(added, what === "blank" ? "blank page" : "page")} at ${plural(gaps.length, "spot")}. The new PDF has ${pageCount + added} pages.`}
      </p>

      <InsertGrid pageCount={pageCount} store={thumbs.store} gaps={new Set(gaps)} label={insertLabel} onToggle={toggle} />

      {error ? <Alert tone="error">{error}</Alert> : null}
      <RunButton busy={job.busy} disabled={!ready} onClick={run}>
        Insert pages
      </RunButton>
      <JobError error={job.error} />
      {job.result ? (
        <div className="flex flex-col gap-3">
          <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-inserted.pdf`} note={`${job.result.pages} pages, ${job.result.inserted} of them inserted`} />
          {job.result.renamedFields ? (
            <Alert tone="info">
              {plural(job.result.renamedFields, "form field was", "form fields were")} renamed (for example “name” became “name_2”), so each inserted copy can be filled in on its own.
            </Alert>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** The pages with a button in every gap; a chosen gap shows what goes there. */
function InsertGrid({ pageCount, store, gaps, label, onToggle }: { pageCount: number; store: ThumbStore | null; gaps: Set<Gap>; label: string; onToggle: (gap: Gap) => void }) {
  const slot = (gap: Gap) => {
    const on = gaps.has(gap);
    return (
      <li key={`gap-${gap}`} className="flex items-stretch">
        <button
          type="button"
          aria-pressed={on}
          aria-label={on ? `${label} inserted ${gapName(gap, pageCount)}. Click to take away` : `Insert ${gapName(gap, pageCount)}`}
          title={on ? "Take away" : "Insert here"}
          onClick={() => onToggle(gap)}
          className={cn(
            "group mx-0.5 flex shrink-0 flex-col items-center justify-center focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring",
            on ? "w-24 border-2 border-dashed border-foreground bg-marker p-1.5 text-marker-foreground" : "w-6 text-muted-foreground opacity-35 hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          {on ? (
            <span className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-xs font-medium">
              <Plus aria-hidden className="size-4" />
              <span className="line-clamp-4 break-words">{label}</span>
            </span>
          ) : (
            <>
              <span aria-hidden className="w-0.5 flex-1 bg-transparent group-hover:bg-border" />
              <Plus aria-hidden className="my-1 size-4 shrink-0" />
              <span aria-hidden className="w-0.5 flex-1 bg-transparent group-hover:bg-border" />
            </>
          )}
        </button>
      </li>
    );
  };
  return (
    <ol aria-label="Pages, with the places to insert between them" className="flex flex-wrap items-stretch gap-y-3">
      {slot(0)}
      {Array.from({ length: pageCount }, (_, i) => [
        <li key={`page-${i}`} className="flex w-24 flex-col gap-1 border border-border bg-card p-1.5">
          <PageThumb store={store} pageIndex={i} className="grid aspect-[3/4] w-full place-items-center overflow-hidden border border-border bg-muted" />
          <p className="font-mono text-[11px]">Page {i + 1}</p>
        </li>,
        slot(i + 1),
      ])}
    </ol>
  );
}
