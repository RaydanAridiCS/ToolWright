"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Search, Trash2 } from "lucide-react";
import { Alert, Button, Field, Input, SegmentedControl, Select, Toggle, baseName, cn } from "@toolwright/ui";
import { PdfCancelled } from "@toolwright/core/pdf-to-images";
import { displaySize, looksDigitallySigned, readPageGeometry, type PageGeometry } from "@toolwright/core/pdf-sign";
import {
  QUALITIES,
  REDACT_LIMITS,
  SEARCH_KINDS,
  assembleRedacted,
  clampBoxes,
  dedupeBoxes,
  pagesToRasterise,
  type RedactBox,
  type RedactQuality,
  type SearchKind,
} from "@toolwright/core/redact-pdf";
import { DownloadResult, PdfDrop, PdfSourceCard, RunButton, RunProgress, usePdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";
import { usePagePreview } from "../../shared/pdf-page-preview";
import { findTextBoxes, renderRedactedPages } from "../../shared/pdf-raster";
import { errorMessage } from "../../shared/format";

interface UiBox extends RedactBox {
  id: number;
  /** The words that were found inside, for boxes made by a search. */
  found: string;
}

interface Draft {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const NUDGE = 4;
const MIN_DRAW = 3;
const round1 = (n: number) => Math.round(n * 10) / 10;

interface Outcome {
  data: Uint8Array;
  rebuilt: number;
  boxes: number;
  capped: number;
}

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  const [boxes, setBoxes] = useState<UiBox[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [quality, setQuality] = useState<RedactQuality>("balanced");
  const [everyPage, setEveryPage] = useState(false);
  const [geometry, setGeometry] = useState<PageGeometry[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    setBoxes([]);
    setSelected(null);
    setPageIndex(0);
    setEveryPage(false);
    setOutcome(null);
    setError(null);
    setGeometry([]);
    if (!source) return;
    let live = true;
    readPageGeometry(source.bytes).then(
      (g) => live && setGeometry(g),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [source]);

  const signed = useMemo(() => (source ? looksDigitallySigned(source.bytes) : false), [source]);
  const pageCount = source?.info.pageCount ?? 0;
  const sizes = useMemo(() => geometry.map(displaySize), [geometry]);
  const markedPages = new Set(boxes.map((b) => b.page)).size;
  const rasterCount = source ? pagesToRasterise(boxes, pageCount, everyPage).length : 0;
  const tooMany = rasterCount > REDACT_LIMITS.maxRasterPages;
  const touch = () => (setOutcome(null), setError(null));

  const change = (next: UiBox[]) => (setBoxes(next), touch());
  const update = (id: number, patch: Partial<RedactBox>) => change(boxes.map((b) => (b.id === id ? { ...b, ...patch, found: "" } : b)));
  const newId = () => nextId.current++;

  function remove() {
    controller.current?.abort();
    pdf.clear();
  }

  async function start() {
    if (!source || boxes.length === 0 || sizes.length !== pageCount) return;
    const stop = new AbortController();
    controller.current = stop;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const clean = clampBoxes(boxes, sizes);
      const pageIndexes = pagesToRasterise(clean, pageCount, everyPage);
      setProgress({ done: 0, total: pageIndexes.length });
      const drawn = await renderRedactedPages(source.file, { pageIndexes, boxes: clean, quality, signal: stop.signal, onProgress: setProgress });
      const data = await assembleRedacted(source.bytes, drawn.pages);
      setOutcome({ data, rebuilt: drawn.pages.size, boxes: clean.length, capped: drawn.cappedPages });
    } catch (err) {
      setError(err instanceof PdfCancelled ? "Stopped. Nothing was saved." : errorMessage(err, "The PDF could not be redacted."));
    } finally {
      setBusy(false);
      setProgress(null);
      if (controller.current === stop) controller.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={remove} /> : <PdfDrop onFile={(f) => void pdf.load(f)} onReject={pdf.setError} loading={pdf.loading} />}
      {pdf.error ? <Alert tone="error">{pdf.error}</Alert> : null}

      {source ? (
        <>
          {signed ? <Alert tone="warning">This PDF carries a digital signature. Redacting changes the file, so the signature will no longer verify.</Alert> : null}
          <Alert tone="info">
            Pages with a box are redrawn as pictures with the boxes painted in, so the covered words are removed from the file, not just hidden. Those pages stop being selectable or searchable. The result has no bookmarks, form fields or document properties.
          </Alert>

          <PageEditor
            key={source.file.name + source.file.size}
            file={source.file}
            pageCount={pageCount}
            pageIndex={pageIndex}
            setPageIndex={setPageIndex}
            sizes={sizes}
            boxes={boxes}
            selected={selected}
            setSelected={setSelected}
            change={change}
            update={update}
            newId={newId}
          />

          <FindPanel file={source.file} boxes={boxes} change={change} newId={newId} setPageIndex={setPageIndex} disabled={busy} />

          <div className="flex flex-col gap-3 border border-border bg-card p-4">
            <SegmentedControl<RedactQuality>
              label="Picture quality"
              value={quality}
              onValueChange={(q) => (setQuality(q), touch())}
              options={(Object.keys(QUALITIES) as RedactQuality[]).map((q) => ({ value: q, label: QUALITIES[q].label }))}
            />
            <p className="text-xs text-muted-foreground">{QUALITIES[quality].hint}</p>
            <Toggle
              label="Turn every page into a picture"
              hint="Off: pages without a box are copied as they are, with their text. On: the whole file becomes pictures, which also removes hidden text, links and notes on the other pages."
              checked={everyPage}
              onCheckedChange={(v) => (setEveryPage(v), touch())}
            />
          </div>

          {tooMany ? <Alert tone="error">{rasterCount} pages would be drawn as pictures. At most {REDACT_LIMITS.maxRasterPages} can be done at once. Mark fewer pages, turn off “every page”, or split the file first.</Alert> : null}

          <div className="flex flex-wrap items-center gap-3">
            <RunButton busy={busy} disabled={boxes.length === 0 || tooMany || sizes.length !== pageCount} onClick={() => void start()}>
              {boxes.length === 0 ? "Redact" : `Redact ${boxes.length} ${boxes.length === 1 ? "area" : "areas"} on ${markedPages} ${markedPages === 1 ? "page" : "pages"}`}
            </RunButton>
            {busy ? (
              <Button variant="outline" size="md" onClick={() => controller.current?.abort()}>
                Cancel
              </Button>
            ) : null}
          </div>
          {busy ? <RunProgress label={`Page ${Math.min((progress?.done ?? 0) + 1, progress?.total ?? 1)} of ${progress?.total ?? 0}`} done={progress?.done ?? 0} total={progress?.total ?? 0} /> : null}
        </>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      {outcome && source ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <DownloadResult data={outcome.data} filename={`${baseName(source.file.name)}-redacted.pdf`} note={`${outcome.rebuilt} ${outcome.rebuilt === 1 ? "page" : "pages"} rebuilt as pictures`} />
          <Alert tone="warning">Open the result and look at every redacted page before you share it. A box that sits a little off can leave part of a word showing.</Alert>
          {outcome.capped > 0 ? <Alert tone="info">{outcome.capped} very large {outcome.capped === 1 ? "page was" : "pages were"} drawn a little smaller than asked, so the browser does not run out of memory.</Alert> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Page preview, drawing and the box list                                                           */
/* ----------------------------------------------------------------------------------------------- */

interface EditorProps {
  file: File;
  pageCount: number;
  pageIndex: number;
  setPageIndex: (n: number) => void;
  sizes: { width: number; height: number }[];
  boxes: UiBox[];
  selected: number | null;
  setSelected: (id: number | null) => void;
  change: (next: UiBox[]) => void;
  update: (id: number, patch: Partial<RedactBox>) => void;
  newId: () => number;
}

function PageEditor({ file, pageCount, pageIndex, setPageIndex, sizes, boxes, selected, setSelected, change, update, newId }: EditorProps) {
  const preview = usePagePreview(file, pageIndex, 900);
  const [draft, setDraft] = useState<Draft | null>(null);
  const view = sizes[pageIndex] ?? { width: 1, height: 1 };
  const current = boxes.find((b) => b.id === selected) ?? null;
  const here = boxes.filter((b) => b.page === pageIndex);

  const point = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * view.width : 0;
    const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * view.height : 0;
    return { x: Math.min(view.width, Math.max(0, x)), y: Math.min(view.height, Math.max(0, y)) };
  };

  const add = (box: Omit<UiBox, "id" | "found">) => {
    const made: UiBox = { ...box, id: newId(), found: "" };
    change([...boxes, made]);
    setSelected(made.id);
  };

  const addCentered = () => {
    const width = Math.min(160, view.width);
    const height = Math.min(24, view.height);
    add({ page: pageIndex, left: round1((view.width - width) / 2), top: round1((view.height - height) / 2), width, height });
  };

  const finishDraw = () => {
    if (!draft) return;
    const left = Math.min(draft.x0, draft.x1);
    const top = Math.min(draft.y0, draft.y1);
    const width = Math.abs(draft.x1 - draft.x0);
    const height = Math.abs(draft.y1 - draft.y0);
    setDraft(null);
    if (width >= MIN_DRAW && height >= MIN_DRAW) add({ page: pageIndex, left: round1(left), top: round1(top), width: round1(width), height: round1(height) });
  };

  const choose = (box: UiBox) => {
    setSelected(box.id);
    setPageIndex(box.page);
  };

  const nudge = (dx: number, dy: number) => current && update(current.id, { left: current.left + dx, top: current.top + dy });
  const shape = (dw: number, dh: number) => current && update(current.id, { width: Math.max(REDACT_LIMITS.minSide, current.width + dw), height: Math.max(REDACT_LIMITS.minSide, current.height + dh) });
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>
            Previous page
          </Button>
          <p className="text-sm" aria-live="polite">
            Page {pageIndex + 1} of {pageCount}
          </p>
          <Button type="button" variant="outline" size="sm" disabled={pageIndex >= pageCount - 1} onClick={() => setPageIndex(pageIndex + 1)}>
            Next page
          </Button>
        </div>
        <div
          className="relative mx-auto block w-full touch-none select-none overflow-hidden border border-foreground bg-muted"
          // The page is never taller than 80% of the window, so it can be drawn on without scrolling.
          style={{ aspectRatio: `${view.width} / ${view.height}`, maxWidth: `calc(80vh * ${view.width / view.height})`, cursor: "crosshair" } as CSSProperties}
          data-testid="redact-surface"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e);
            setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => {
            if (!draft) return;
            const p = point(e);
            setDraft({ ...draft, x1: p.x, y1: p.y });
          }}
          onPointerUp={finishDraw}
          onPointerCancel={() => setDraft(null)}
        >
          {preview.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
            <img src={preview.url} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-fill" />
          ) : (
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">{preview.failed ? "No preview available" : "Drawing page…"}</span>
          )}
          {here.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Select box ${boxes.indexOf(b) + 1}`}
              aria-pressed={b.id === selected}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelected(b.id)}
              className={cn("absolute cursor-pointer border bg-foreground/80 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", b.id === selected ? "border-2 border-ring" : "border-foreground")}
              style={{ left: pct(b.left, view.width), top: pct(b.top, view.height), width: pct(b.width, view.width), height: pct(b.height, view.height) }}
            />
          ))}
          {draft ? (
            <div
              aria-hidden
              className="pointer-events-none absolute border border-dashed border-foreground bg-foreground/40"
              style={{
                left: pct(Math.min(draft.x0, draft.x1), view.width),
                top: pct(Math.min(draft.y0, draft.y1), view.height),
                width: pct(Math.abs(draft.x1 - draft.x0), view.width),
                height: pct(Math.abs(draft.y1 - draft.y0), view.height),
              }}
            />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Drag across the page to cover an area. Click a box to select it. No keyboard or mouse? Use “Add box” and the position fields.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" size="sm" onClick={addCentered}>
            <Plus aria-hidden /> Add box
          </Button>
          {boxes.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => (change([]), setSelected(null))}>
              Remove all
            </Button>
          ) : null}
        </div>
        {boxes.length === 0 ? <p className="text-sm text-muted-foreground">Nothing marked yet.</p> : null}
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-label="Marked areas">
          {boxes.map((b, i) => (
            <li key={b.id} className={cn("flex items-center gap-2 border p-2", b.id === selected ? "border-foreground bg-accent/20" : "border-border bg-card")}>
              <Button type="button" size="sm" variant={b.id === selected ? "primary" : "outline"} aria-pressed={b.id === selected} onClick={() => choose(b)}>
                {b.id === selected ? "Selected" : "Select"}
              </Button>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                Box {i + 1} · page {b.page + 1}
                {b.found ? ` · “${b.found}”` : ""}
              </span>
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove box ${i + 1}`} onClick={() => (change(boxes.filter((x) => x.id !== b.id)), b.id === selected && setSelected(null))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>

        {current ? (
          <div className="flex flex-col gap-2 border border-border bg-card p-3" role="group" aria-label="Position and size of the selected box">
            <p className="label-plate">Selected box</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="From left" suffix="pt" value={String(current.left)} min={0} step={1} onChange={(v) => update(current.id, { left: num(v) })} />
              <NumberField label="From top" suffix="pt" value={String(current.top)} min={0} step={1} onChange={(v) => update(current.id, { top: num(v) })} />
              <NumberField label="Width" suffix="pt" value={String(current.width)} min={REDACT_LIMITS.minSide} step={1} onChange={(v) => update(current.id, { width: num(v) })} />
              <NumberField label="Height" suffix="pt" value={String(current.height)} min={REDACT_LIMITS.minSide} step={1} onChange={(v) => update(current.id, { height: num(v) })} />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Move the selected box">
              <Button type="button" size="sm" variant="outline" aria-label="Move left" onClick={() => nudge(-NUDGE, 0)}>
                <ArrowLeft aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label="Move up" onClick={() => nudge(0, -NUDGE)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label="Move down" onClick={() => nudge(0, NUDGE)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label="Move right" onClick={() => nudge(NUDGE, 0)}>
                <ArrowRight aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => shape(NUDGE, 0)}>
                Wider
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => shape(0, NUDGE)}>
                Taller
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The page is {Math.round(view.width)} × {Math.round(view.height)} pt. Each step is {NUDGE} pt.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Find text to mark                                                                                */
/* ----------------------------------------------------------------------------------------------- */

function FindPanel({ file, boxes, change, newId, setPageIndex, disabled }: { file: File; boxes: UiBox[]; change: (next: UiBox[]) => void; newId: () => number; setPageIndex: (n: number) => void; disabled: boolean }) {
  const [kind, setKind] = useState<SearchKind>("text");
  const [term, setTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);

  async function find() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await findTextBoxes(file, { kind, term, matchCase });
      const fresh: UiBox[] = result.found.map((f) => ({ id: newId(), page: f.page, left: round1(f.left), top: round1(f.top), width: round1(f.width), height: round1(f.height), found: f.text }));
      const merged = dedupeBoxes([...boxes, ...fresh]);
      const added = merged.filter((b) => fresh.includes(b));
      change(merged);
      const noText = result.pagesWithoutText.length;
      const scanned = noText > 0 ? ` ${noText === result.pageCount ? "No page has selectable text (this looks like a scan), so a search cannot find anything. Draw boxes by hand." : `Pages with no selectable text, which a search cannot see: ${result.pagesWithoutText.slice(0, 12).map((p) => p + 1).join(", ")}${noText > 12 ? "…" : ""}. Draw boxes there by hand.`}` : "";
      if (added.length === 0) setMessage({ tone: "warning", text: `Nothing new was found.${scanned}` });
      else {
        const pages = new Set(added.map((b) => b.page));
        setPageIndex(Math.min(...pages));
        setMessage({ tone: noText > 0 ? "warning" : "info", text: `Marked ${added.length} ${added.length === 1 ? "place" : "places"} on ${pages.size} ${pages.size === 1 ? "page" : "pages"}. Check each box on the page: the position inside a line is an estimate.${scanned}` });
      }
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err, "The text could not be searched.") });
    } finally {
      setBusy(false);
    }
  }

  const ready = kind !== "text" || term.trim() !== "";
  return (
    <div className="flex flex-col gap-3 border border-border bg-card p-4">
      <p className="label-plate">Find text to cover</p>
      <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <Field label="Look for">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as SearchKind)}>
              {(Object.keys(SEARCH_KINDS) as SearchKind[]).map((k) => (
                <option key={k} value={k}>
                  {SEARCH_KINDS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {kind === "text" ? <Field label="Words to find">{(id) => <Input id={id} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ready && !busy && void find()} />}</Field> : null}
      </div>
      {kind === "text" ? <Toggle label="Match upper and lower case exactly" checked={matchCase} onCheckedChange={setMatchCase} /> : null}
      <Button type="button" variant="outline" size="md" className="self-start" disabled={!ready || busy || disabled} onClick={() => void find()}>
        <Search aria-hidden /> {busy ? "Searching…" : "Find and mark"}
      </Button>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </div>
  );
}
