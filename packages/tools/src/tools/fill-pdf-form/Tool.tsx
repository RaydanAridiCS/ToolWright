"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, Input, SegmentedControl, Select, Textarea, Toggle, baseName, cn } from "@toolwright/ui";
import { STAMP_LIMITS, changedValues, fillPdfForm, readForm, type FieldValue, type FormFieldInfo, type FormInfo, type TextStamp } from "@toolwright/core/fill-pdf-form";
import { displaySize, readPageGeometry, type PageGeometry } from "@toolwright/core/pdf-sign";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";
import { usePagePreview } from "../../shared/pdf-page-preview";
import { errorMessage } from "../../shared/format";

/* ----------------------------------------------------------------------------------------------- */
/* Reading the form                                                                                 */
/* ----------------------------------------------------------------------------------------------- */

interface FormState {
  status: "reading" | "done" | "failed";
  info?: FormInfo;
  error?: string;
}

function useForm(source: PdfSource | null): FormState | null {
  const [state, setState] = useState<FormState | null>(null);
  useEffect(() => {
    if (!source) {
      setState(null);
      return;
    }
    let live = true;
    setState({ status: "reading" });
    readForm(source.bytes).then(
      (info) => live && setState({ status: "done", info }),
      (err) => live && setState({ status: "failed", error: errorMessage(err, "The form could not be read.") }),
    );
    return () => {
      live = false;
    };
  }, [source]);
  return state;
}

/* ----------------------------------------------------------------------------------------------- */
/* Form fields                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

function FieldEditor({ field, value, onChange }: { field: FormFieldInfo; value: FieldValue; onChange: (value: FieldValue) => void }) {
  const label = (
    <>
      {field.name}
      {field.required ? <span aria-hidden> *</span> : null}
    </>
  );
  const hint = [field.required ? "Required" : "", field.readOnly ? "Read-only" : "", field.maxLength ? `Up to ${field.maxLength} characters` : ""].filter(Boolean).join(" · ") || undefined;

  if (field.kind === "checkbox") {
    return <Toggle label={label} hint={hint} checked={value === true} disabled={field.readOnly} onCheckedChange={onChange} />;
  }
  if (field.kind === "list" && field.multiSelect) {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <fieldset className="flex flex-col gap-1.5" disabled={field.readOnly}>
        <legend className="text-sm font-medium">{label}</legend>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {field.options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={chosen.includes(option)} onChange={(e) => onChange(e.target.checked ? [...chosen, option] : chosen.filter((o) => o !== option))} />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.kind === "radio" || field.kind === "dropdown" || field.kind === "list") {
    const current = Array.isArray(value) ? (value[0] ?? "") : String(value);
    return (
      <Field label={label} hint={hint}>
        {(id) => (
          <Select id={id} value={current} disabled={field.readOnly} onChange={(e) => onChange(e.target.value)}>
            <option value="">(nothing chosen)</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        )}
      </Field>
    );
  }
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        field.multiline ? (
          <Textarea id={id} mono={false} rows={3} value={String(value)} maxLength={field.maxLength} disabled={field.readOnly} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input id={id} value={String(value)} maxLength={field.maxLength} disabled={field.readOnly} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

function FieldsTab({ info, values, setValues }: { info: FormInfo; values: Record<string, FieldValue>; setValues: (next: Record<string, FieldValue>) => void }) {
  const [query, setQuery] = useState("");
  const shown = info.fields.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = useMemo(() => {
    const map = new Map<number, FormFieldInfo[]>();
    for (const f of shown) {
      const key = f.page ?? -1;
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [shown]);

  return (
    <div className="flex flex-col gap-4">
      {info.fields.length > 10 ? (
        <Field label="Find a field" hint={`${shown.length} of ${info.fields.length} fields shown`}>
          {(id) => <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} />}
        </Field>
      ) : null}
      {groups.map(([page, fields]) => (
        <section key={page} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label={page < 0 ? "Other fields" : `Page ${page + 1} fields`}>
          <h3 className="label-plate">{page < 0 ? "Other fields" : `Page ${page + 1}`}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((f) => (
              <FieldEditor key={f.name} field={f} value={f.name in values ? (values[f.name] as FieldValue) : f.value} onChange={(v) => setValues({ ...values, [f.name]: v })} />
            ))}
          </div>
        </section>
      ))}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No field matches “{query}”.</p> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Typing onto the page                                                                             */
/* ----------------------------------------------------------------------------------------------- */

type ColourKey = "black" | "blue";
const COLOURS: Record<ColourKey, { r: number; g: number; b: number; css: string; label: string }> = {
  black: { r: 0, g: 0, b: 0, css: "#111111", label: "Black" },
  blue: { r: 0.05, g: 0.2, b: 0.7, css: "#0d33b3", label: "Blue" },
};

interface Stamp {
  id: number;
  page: number;
  left: number;
  top: number;
  text: string;
  size: number;
  colour: ColourKey;
}

const NUDGE = 4;

function PageTab({ source, stamps, setStamps, selected, setSelected }: { source: PdfSource; stamps: Stamp[]; setStamps: (next: Stamp[]) => void; selected: number | null; setSelected: (id: number | null) => void }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [geometry, setGeometry] = useState<PageGeometry[]>([]);
  const preview = usePagePreview(source.file, pageIndex, 900);

  useEffect(() => {
    let live = true;
    readPageGeometry(source.bytes).then(
      (g) => live && setGeometry(g),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [source]);

  const g = geometry[pageIndex];
  const view = g ? displaySize(g) : { width: 1, height: 1 };
  const current = stamps.find((s) => s.id === selected) ?? null;
  const update = (id: number, patch: Partial<Stamp>) => setStamps(stamps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const add = (text: string, left = view.width / 2, top = view.height / 2) => {
    const stamp: Stamp = { id: Math.max(0, ...stamps.map((x) => x.id)) + 1, page: pageIndex, left: Math.round(left), top: Math.round(top), text, size: 12, colour: "black" };
    setStamps([...stamps, stamp]);
    setSelected(stamp.id);
  };

  const place = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const left = ((event.clientX - rect.left) / rect.width) * view.width;
    const top = ((event.clientY - rect.top) / rect.height) * view.height;
    if (current) update(current.id, { page: pageIndex, left: Math.round(left), top: Math.round(top) });
    else add("Text", left, top);
  };

  const choose = (stamp: Stamp) => {
    setSelected(stamp.id);
    setPageIndex(stamp.page);
  };

  const nudge = (dx: number, dy: number) => current && update(current.id, { left: current.left + dx, top: current.top + dy });
  const here = stamps.filter((s) => s.page === pageIndex);
  const pageCount = source.info.pageCount;

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
          className="relative block w-full overflow-hidden border border-foreground bg-muted"
          style={{ aspectRatio: `${view.width} / ${view.height}`, containerType: "inline-size" } as CSSProperties}
        >
          {preview.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
            <img src={preview.url} alt="" className="absolute inset-0 size-full object-fill" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{preview.failed ? "No preview available" : "Drawing page…"}</span>
          )}
          {here.map((s) => (
            <span
              key={s.id}
              aria-hidden
              className={cn("pointer-events-none absolute whitespace-pre leading-none", s.id === selected && "outline outline-1 outline-offset-2 outline-ring")}
              style={{
                left: `${(s.left / view.width) * 100}%`,
                top: `${(s.top / view.height) * 100}%`,
                fontSize: `${(s.size / view.width) * 100}cqw`,
                color: COLOURS[s.colour].css,
                fontFamily: "Helvetica, Arial, sans-serif",
                transform: "translateY(-85%)",
              }}
            >
              {s.text}
            </span>
          ))}
          {/* An empty layer over the page that takes the click. The drawn text is a sibling, so the button has no visible text of its own to name. */}
          <button
            type="button"
            onClick={place}
            aria-label={current ? "Page preview. Click to move the selected text here." : "Page preview. Click to add text here."}
            className="absolute inset-0 size-full cursor-crosshair bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        </div>
        <p className="text-xs text-muted-foreground">Text sits on the line at the point you click, like writing on a form. {current ? "Click the page to move the selected text." : "Click the page to add text."}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" size="sm" onClick={() => add("Text")}>
            <Plus aria-hidden /> Add text
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => add("X")}>
            Add X mark
          </Button>
        </div>
        {stamps.length === 0 ? <p className="text-sm text-muted-foreground">Nothing added yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {stamps.map((s, i) => (
            <li key={s.id} className={cn("flex flex-col gap-2 border p-2", s.id === selected ? "border-foreground bg-accent/20" : "border-border bg-card")}>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant={s.id === selected ? "primary" : "outline"} aria-pressed={s.id === selected} onClick={() => choose(s)}>
                  {s.id === selected ? "Selected" : "Select"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Text {i + 1} · page {s.page + 1}
                </span>
                <Button type="button" size="sm" variant="ghost" className="ml-auto" aria-label={`Remove text ${i + 1}`} onClick={() => (setStamps(stamps.filter((x) => x.id !== s.id)), s.id === selected && setSelected(null))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <Input aria-label={`Text ${i + 1}`} value={s.text} onChange={(e) => update(s.id, { text: e.target.value })} onFocus={() => choose(s)} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Size" suffix="pt" value={String(s.size)} min={STAMP_LIMITS.minSize} max={STAMP_LIMITS.maxSize} step={1} onChange={(v) => update(s.id, { size: num(v) || STAMP_LIMITS.minSize })} />
                <Field label="Colour">
                  {(id) => (
                    <Select id={id} value={s.colour} onChange={(e) => update(s.id, { colour: e.target.value as ColourKey })}>
                      {(Object.keys(COLOURS) as ColourKey[]).map((k) => (
                        <option key={k} value={k}>
                          {COLOURS[k].label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ul>

        {current ? (
          <div className="flex flex-col gap-2 border border-border bg-card p-3" role="group" aria-label="Position of the selected text">
            <p className="label-plate">Position</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="From left" suffix="pt" value={String(current.left)} min={0} step={1} onChange={(v) => update(current.id, { left: num(v) })} />
              <NumberField label="From top" suffix="pt" value={String(current.top)} min={0} step={1} onChange={(v) => update(current.id, { top: num(v) })} />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nudge the selected text">
              <Button type="button" size="sm" variant="outline" aria-label="Nudge left" onClick={() => nudge(-NUDGE, 0)}>
                <ArrowLeft aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label="Nudge up" onClick={() => nudge(0, -NUDGE)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label="Nudge down" onClick={() => nudge(0, NUDGE)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label="Nudge right" onClick={() => nudge(NUDGE, 0)}>
                <ArrowRight aria-hidden />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">The page is {Math.round(view.width)} × {Math.round(view.height)} pt. Each nudge moves {NUDGE} pt.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Tool                                                                                             */
/* ----------------------------------------------------------------------------------------------- */

type Mode = "fields" | "page";

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  const form = useForm(source);
  const info = form?.info;
  const [mode, setMode] = useState<Mode>("fields");
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [flatten, setFlatten] = useState(false);
  const job = useJob<Uint8Array>();

  useEffect(() => {
    setValues({});
    setStamps([]);
    setSelected(null);
    setFlatten(false);
    job.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- job.reset is stable; only a new file resets the form
  }, [source]);

  // A form with fields opens on its fields; a flat PDF opens on the page.
  useEffect(() => {
    if (info) setMode(info.fields.length > 0 ? "fields" : "page");
  }, [info]);

  const changed = info ? changedValues(info.fields, values) : {};
  const outStamps: TextStamp[] = stamps
    .filter((s) => s.text.trim() !== "")
    .map((s) => ({ page: s.page, left: s.left, top: s.top, text: s.text, size: s.size, color: COLOURS[s.colour] }));
  const nothing = Object.keys(changed).length === 0 && outStamps.length === 0 && !flatten;
  const hasFields = (info?.fields.length ?? 0) > 0;

  const run = () => job.run(() => fillPdfForm(source!.bytes, { values: changed, stamps: outStamps, flatten: flatten && hasFields }));

  const touch = <T,>(setter: (v: T) => void) => (v: T) => (setter(v), job.reset());

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => pdf.clear()} /> : <PdfDrop onFile={(f) => void pdf.load(f)} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />
      {form?.status === "failed" && form.error ? <Alert tone="error">{form.error}</Alert> : null}

      {source && info ? (
        <>
          {info.signed ? <Alert tone="warning">This PDF carries a digital signature. Any change breaks it, so the saved copy will no longer verify.</Alert> : null}
          {info.xfa ? <Alert tone="warning">This is a dynamic (XFA) form. The fields listed here are its standard version, and the dynamic part is dropped when the file is saved.</Alert> : null}
          {info.signatureFields > 0 ? <Alert tone="info">{info.signatureFields} signature field{info.signatureFields === 1 ? "" : "s"} cannot be filled here. To add your signature as a picture, use Sign PDF.</Alert> : null}
          {!hasFields ? <Alert tone="info">This PDF has no form fields. Click the page and type where the text belongs.</Alert> : null}

          {hasFields ? (
            <SegmentedControl<Mode>
              label="Fill by"
              value={mode}
              onValueChange={(m) => setMode(m)}
              options={[
                { value: "fields", label: `Form fields (${info.fields.length})` },
                { value: "page", label: "Type on the page" },
              ]}
            />
          ) : null}

          {mode === "fields" && hasFields ? <FieldsTab info={info} values={values} setValues={touch(setValues)} /> : null}
          {mode === "page" || !hasFields ? <PageTab source={source} stamps={stamps} setStamps={touch(setStamps)} selected={selected} setSelected={setSelected} /> : null}

          {hasFields ? (
            <Toggle
              label="Flatten the form"
              hint="Makes the entries permanent page content and removes the fields, so they cannot be edited and look the same everywhere."
              checked={flatten}
              onCheckedChange={touch(setFlatten)}
            />
          ) : null}

          <RunButton busy={job.busy} disabled={nothing} onClick={run}>
            {flatten && hasFields ? "Fill and flatten" : "Create filled PDF"}
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-filled.pdf`} /> : null}
    </div>
  );
}
