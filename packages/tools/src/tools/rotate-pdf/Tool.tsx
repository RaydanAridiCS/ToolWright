"use client";

import { useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button, Field, Input, SegmentedControl, baseName } from "@toolwright/ui";
import { parsePageRanges, rotatePagesBy } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfBatchDrop, PdfLoadStatus, PdfSourceList, RunButton, runOnAll, useJob, usePdfSource, type BatchOutput, type PdfSource } from "../../shared/pdf-ui";
import { PageThumb, useThumbnails } from "../../shared/pdf-thumbs";
import { errorMessage } from "../../shared/format";

type Angle = "90" | "180" | "270";
type Scope = "all" | "pages";

/** Pages with a preview card. Past this, the quick controls above still reach every page. */
const MAX_CARDS = 150;

const normal = (deg: number) => ((deg % 360) + 360) % 360;

/** Clockwise turn for every page of a file, from the quick controls. Throws when the page range does not fit. */
function quickTurns(pageCount: number, angle: number, scope: Scope, spec: string): number[] {
  if (scope === "all") return Array.from({ length: pageCount }, () => angle);
  const targets = new Set(parsePageRanges(spec, pageCount));
  return Array.from({ length: pageCount }, (_, i) => (targets.has(i) ? angle : 0));
}

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceList sources={pdf.all} onRemove={pdf.remove} /> : null}
      <PdfBatchDrop more={Boolean(source)} onFiles={(files) => void pdf.loadMany(files)} onReject={pdf.setError} loading={pdf.loading} />
      <PdfLoadStatus pdf={pdf} />
      {pdf.all.length > 1 ? <BatchRotator sources={pdf.all} /> : source ? <Rotator key={`${source.file.name}-${source.file.size}-${source.file.lastModified}`} source={source} /> : null}
    </div>
  );
}

function QuickControls({ angle, scope, pages, hint, invalid, onAngle, onScope, onPages }: { angle: Angle; scope: Scope; pages: string; hint: string; invalid: boolean; onAngle: (a: Angle) => void; onScope: (s: Scope) => void; onPages: (p: string) => void }) {
  return (
    <div className="flex flex-col gap-4 border border-border bg-card p-4">
      <SegmentedControl
        label="Rotation"
        value={angle}
        onValueChange={onAngle}
        options={[
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° counter-clockwise" },
        ]}
      />
      <SegmentedControl
        label="Pages"
        value={scope}
        onValueChange={onScope}
        options={[
          { value: "all", label: "All pages" },
          { value: "pages", label: "Selected pages" },
        ]}
      />
      {scope === "pages" ? (
        <Field label="Pages to rotate" hint={hint}>
          {(id) => <Input id={id} mono value={pages} aria-invalid={invalid ? true : undefined} onChange={(e) => onPages(e.target.value)} />}
        </Field>
      ) : null}
    </div>
  );
}

/** Several files: the same quick setting for each, no per-page grid. */
function BatchRotator({ sources }: { sources: PdfSource[] }) {
  const [angle, setAngle] = useState<Angle>("90");
  const [scope, setScope] = useState<Scope>("all");
  const [pages, setPages] = useState("1");
  const job = useJob<BatchOutput>();
  return (
    <>
      <QuickControls
        angle={angle}
        scope={scope}
        pages={pages}
        invalid={false}
        hint="For example 1-3, 5, 8-. The same pages turn in every file."
        onAngle={(a) => (setAngle(a), job.reset())}
        onScope={(s) => (setScope(s), job.reset())}
        onPages={(p) => (setPages(p), job.reset())}
      />
      <RunButton busy={job.busy} onClick={() => job.run(() => runOnAll(sources, "rotated", (s) => rotatePagesBy(s.bytes, quickTurns(s.info.pageCount, Number(angle), scope, pages))))}>
        Rotate {sources.length} PDFs
      </RunButton>
      <JobError error={job.error} />
      {job.result ? <DownloadResult {...job.result} /> : null}
    </>
  );
}

function Rotator({ source }: { source: PdfSource }) {
  const total = source.info.pageCount;
  const [angle, setAngle] = useState<Angle>("90");
  const [scope, setScope] = useState<Scope>("all");
  const [pages, setPages] = useState("1");
  const [rangeError, setRangeError] = useState<string | null>(null);
  // Extra clockwise turn for each page. Starts as "every page 90° clockwise", which matches the quick controls.
  const [turns, setTurns] = useState<number[]>(() => Array.from({ length: total }, () => 90));
  const job = useJob<Uint8Array>();
  const thumbs = useThumbnails(source.file);

  /** The quick controls set the whole plan; per-page buttons below then fine-tune it. */
  const applyQuick = (next: { angle?: Angle; scope?: Scope; pages?: string }) => {
    job.reset();
    try {
      setTurns(quickTurns(total, Number(next.angle ?? angle), next.scope ?? scope, next.pages ?? pages));
      setRangeError(null);
    } catch (err) {
      setRangeError(errorMessage(err));
    }
  };

  const turnOne = (index: number, delta: number) => {
    job.reset();
    setTurns((current) => current.map((t, i) => (i === index ? normal(t + delta) : t)));
  };
  const turnAll = (delta: number) => {
    job.reset();
    setTurns((current) => current.map((t) => normal(t + delta)));
  };

  const changed = turns.filter((t) => normal(t) !== 0).length;
  const cards = Math.min(total, MAX_CARDS);

  return (
    <>
      <QuickControls
        angle={angle}
        scope={scope}
        pages={pages}
        invalid={rangeError !== null}
        hint={rangeError ?? `For example 1-3, 5, 8-. This PDF has ${total} pages.`}
        onAngle={(a) => (setAngle(a), applyQuick({ angle: a }))}
        onScope={(sc) => (setScope(sc), applyQuick({ scope: sc }))}
        onPages={(p) => (setPages(p), applyQuick({ pages: p }))}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={() => turnAll(-90)}>
          <RotateCcw /> Turn all left
        </Button>
        <Button variant="outline" size="sm" onClick={() => turnAll(90)}>
          <RotateCw /> Turn all right
        </Button>
        <Button variant="ghost" size="sm" disabled={changed === 0} onClick={() => (job.reset(), setTurns(Array.from({ length: total }, () => 0)))}>
          Reset
        </Button>
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {changed === 0 ? "No pages will turn" : `${changed} of ${total} page${total === 1 ? "" : "s"} will turn`}
        </p>
      </div>
      {thumbs.failed ? <p className="text-sm text-muted-foreground">Page previews could not be drawn for this file. You can still turn each page.</p> : null}

      <ol aria-label="Pages and how they will turn" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: cards }, (_, i) => {
          const turn = normal(turns[i] ?? 0);
          const finalAngle = normal((source.info.pages[i]?.rotation ?? 0) + turn);
          return (
            <li key={i} className={`flex flex-col gap-2 border bg-card p-2 ${turn ? "border-foreground" : "border-border"}`}>
              <button
                type="button"
                onClick={() => turnOne(i, 90)}
                aria-label={`Turn page ${i + 1} clockwise`}
                className="grid h-32 w-full place-items-center overflow-hidden border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PageThumb store={thumbs.store} pageIndex={i} turn={turn} className="grid size-28 place-items-center overflow-hidden" />
              </button>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs text-muted-foreground">
                  p. {i + 1}
                  {turn ? <span className="ml-1 bg-marker px-1 text-marker-foreground">+{turn}°</span> : null}
                </span>
                <span className="flex">
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Turn page ${i + 1} counter-clockwise`} onClick={() => turnOne(i, -90)}>
                    <RotateCcw />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Turn page ${i + 1} clockwise, now ${finalAngle}°`} onClick={() => turnOne(i, 90)}>
                    <RotateCw />
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {total > MAX_CARDS ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {MAX_CARDS} pages. The controls above still turn all {total} pages.
        </p>
      ) : null}

      <RunButton busy={job.busy} disabled={changed === 0 || rangeError !== null} onClick={() => job.run(() => rotatePagesBy(source.bytes, turns))}>
        Rotate PDF
      </RunButton>

      <JobError error={job.error} />
      {job.result ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-rotated.pdf`} note={`${changed} page${changed === 1 ? "" : "s"} turned`} /> : null}
    </>
  );
}
