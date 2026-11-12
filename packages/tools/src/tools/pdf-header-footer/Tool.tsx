"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Alert, Button, Field, Input, SegmentedControl, Select, Toggle, baseName } from "@toolwright/ui";
import { parseColor } from "@toolwright/core/color";
import { displaySize, looksDigitallySigned, readPageGeometry, type PageGeometry } from "@toolwright/core/pdf-sign";
import {
  DEFAULT_BATES,
  HEADER_FOOTER_LIMITS,
  TOKENS,
  ZONES,
  ZONE_LABELS,
  addHeaderFooter,
  choosePages,
  expandTokens,
  formatBates,
  usesBates,
  zonesForPage,
  type PageChoice,
  type Zone,
} from "@toolwright/core/pdf-header-footer";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";
import { usePagePreview } from "../../shared/pdf-page-preview";
import { loadPdfFont } from "../../shared/pdf-fonts";
import { errorMessage } from "../../shared/format";

type Zones = Record<Zone, string>;
const EMPTY: Zones = { "header-left": "", "header-center": "", "header-right": "", "footer-left": "", "footer-center": "", "footer-right": "" };

interface Preset {
  label: string;
  zones: Partial<Zones>;
  bates?: { prefix: string; digits: number };
}

const PRESETS: Record<string, Preset> = {
  numbers: { label: "Page 1 of N, centred in the footer", zones: { "footer-center": "Page {page} of {pages}" } },
  bates: { label: "Bates numbers, bottom right", zones: { "footer-right": "{bates}" }, bates: { prefix: "ACME-", digits: 6 } },
  document: { label: "File name and date on top, page number below", zones: { "header-left": "{file}", "header-right": "{date}", "footer-center": "{page}" } },
  confidential: { label: "Confidential header, Bates and page number in the footer", zones: { "header-center": "CONFIDENTIAL", "footer-left": "{bates}", "footer-right": "Page {page} of {pages}" }, bates: { prefix: "", digits: 6 } },
};

const today = () => new Date().toLocaleDateString("en-CA");

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  const [zones, setZones] = useState<Zones>({ ...EMPTY, "footer-center": "Page {page} of {pages}" });
  const [lastZone, setLastZone] = useState<Zone>("footer-center");
  const [size, setSize] = useState("10");
  const [margin, setMargin] = useState("36");
  const [color, setColor] = useState("#333333");
  const [startAt, setStartAt] = useState("1");
  const [dateText, setDateText] = useState(today);
  const [bates, setBates] = useState({ ...DEFAULT_BATES, prefix: "", start: "1", digits: "6", suffix: "" });
  const [choice, setChoice] = useState<PageChoice>("all");
  const [spec, setSpec] = useState("");
  const [skipFirst, setSkipFirst] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [geometry, setGeometry] = useState<PageGeometry[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const job = useJob<Uint8Array>();

  useEffect(() => {
    setGeometry([]);
    setPageIndex(0);
    job.reset();
    if (!source) return;
    let live = true;
    readPageGeometry(source.bytes).then(
      (g) => live && setGeometry(g),
      () => undefined,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- job.reset is stable; only a new file resets the page
  }, [source]);

  const pageCount = source?.info.pageCount ?? 0;
  const fileName = source ? baseName(source.file.name) : "";
  const batesOptions = { prefix: bates.prefix, suffix: bates.suffix, start: Math.floor(num(bates.start)), digits: Math.floor(num(bates.digits)) };
  const startNumber = Number.isFinite(num(startAt)) && startAt.trim() !== "" ? Math.floor(num(startAt)) : 1;
  const sizePt = num(size) || 10;
  const marginPt = Number.isFinite(num(margin)) && margin.trim() !== "" ? num(margin) : 36;

  const selection = useMemo(() => {
    if (!pageCount) return { pages: [] as number[], error: null as string | null };
    try {
      return { pages: choosePages(choice, spec, pageCount, skipFirst), error: null };
    } catch (err) {
      return { pages: [], error: errorMessage(err) };
    }
  }, [choice, spec, pageCount, skipFirst]);

  const signed = useMemo(() => (source ? looksDigitallySigned(source.bytes) : false), [source]);
  const filled = ZONES.filter((z) => zones[z].trim() !== "");
  const edit = () => job.reset();
  const setZone = (zone: Zone, value: string) => (setZones((z) => ({ ...z, [zone]: value })), edit());

  const insert = (token: string) => setZone(lastZone, zones[lastZone] + token);

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    setZones({ ...EMPTY, ...preset.zones });
    if (preset.bates) setBates((b) => ({ ...b, prefix: preset.bates!.prefix, digits: String(preset.bates!.digits) }));
    setLastZone(ZONES.find((z) => preset.zones[z]) ?? "footer-center");
    edit();
  };

  const run = () => {
    if (!source) return;
    const c = parseColor(color) ?? { r: 51, g: 51, b: 51, a: 1 };
    return job.run(() =>
      addHeaderFooter(source.bytes, {
        zones,
        fontSize: sizePt,
        margin: marginPt,
        color: { r: c.r / 255, g: c.g / 255, b: c.b / 255 },
        startAt: startNumber,
        bates: batesOptions,
        pages: selection.pages,
        mirror,
        date: dateText,
        fileName,
        loadFont: loadPdfFont,
      }),
    );
  };

  const needsBates = usesBates(zones);
  const batesExample = formatBates(batesOptions, Number.isFinite(batesOptions.start) ? batesOptions.start : 1);

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => pdf.clear()} /> : <PdfDrop onFile={(f) => void pdf.load(f)} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          {signed ? <Alert tone="warning">This PDF carries a digital signature. Adding text changes the file, so the signature will no longer verify.</Alert> : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <div className="flex flex-col gap-4">
              <Field label="Start from a layout" hint="Fills the boxes below. You can change anything afterwards.">
                {(id) => (
                  <Select id={id} value="" onChange={(e) => applyPreset(e.target.value)}>
                    <option value="" disabled>
                      Choose a layout…
                    </option>
                    {Object.entries(PRESETS).map(([key, p]) => (
                      <option key={key} value={key}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="grid gap-3 border border-border bg-card p-4 sm:grid-cols-3" role="group" aria-label="Header and footer text">
                {ZONES.map((zone) => (
                  <Field key={zone} label={ZONE_LABELS[zone]}>
                    {(id) => <Input id={id} value={zones[zone]} maxLength={HEADER_FOOTER_LIMITS.maxTextLength} onFocus={() => setLastZone(zone)} onChange={(e) => setZone(zone, e.target.value)} />}
                  </Field>
                ))}
              </div>

              <div className="flex flex-col gap-2" role="group" aria-label="Insert into the box you last used">
                <p className="text-sm font-medium">Insert into “{ZONE_LABELS[lastZone]}”</p>
                <div className="flex flex-wrap gap-2">
                  {TOKENS.map((t) => (
                    <Button key={t.token} type="button" variant="outline" size="sm" onClick={() => insert(t.token)} title={`Prints, for example, ${t.example}`}>
                      {t.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  The tokens <code className="font-mono">{"{page}"}</code> <code className="font-mono">{"{pages}"}</code> <code className="font-mono">{"{bates}"}</code> <code className="font-mono">{"{date}"}</code> <code className="font-mono">{"{file}"}</code> are replaced on every page.
                </p>
              </div>

              <div className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField label="Text size" suffix="pt" value={size} onChange={(v) => (setSize(v), edit())} min={HEADER_FOOTER_LIMITS.minSize} max={HEADER_FOOTER_LIMITS.maxSize} />
                <NumberField label="Margin" suffix="pt" value={margin} onChange={(v) => (setMargin(v), edit())} min={0} max={HEADER_FOOTER_LIMITS.maxMargin} />
                <NumberField label="First page is number" value={startAt} onChange={(v) => (setStartAt(v), edit())} step={1} />
                <Field label="Colour">
                  {(id) => <input id={id} type="color" value={color} onChange={(e) => (setColor(e.target.value), edit())} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card p-1" />}
                </Field>
                <Field label="Text for {date}" className="sm:col-span-2">
                  {(id) => <Input id={id} value={dateText} onChange={(e) => (setDateText(e.target.value), edit())} />}
                </Field>
              </div>

              {needsBates ? (
                <div className="flex flex-col gap-3 border border-border bg-card p-4" role="group" aria-label="Bates numbering">
                  <p className="label-plate">Bates numbering</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Prefix">{(id) => <Input id={id} value={bates.prefix} maxLength={HEADER_FOOTER_LIMITS.maxAffix} onChange={(e) => (setBates({ ...bates, prefix: e.target.value }), edit())} />}</Field>
                    <NumberField label="First number" value={bates.start} onChange={(v) => (setBates({ ...bates, start: v }), edit())} min={0} step={1} />
                    <NumberField label="Digits" value={bates.digits} onChange={(v) => (setBates({ ...bates, digits: v }), edit())} min={1} max={HEADER_FOOTER_LIMITS.maxBatesDigits} step={1} />
                    <Field label="Suffix">{(id) => <Input id={id} value={bates.suffix} maxLength={HEADER_FOOTER_LIMITS.maxAffix} onChange={(e) => (setBates({ ...bates, suffix: e.target.value }), edit())} />}</Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The first stamped page reads <span className="font-mono">{batesExample}</span>, and each stamped page after it counts up by one.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border border-border bg-card p-4">
                <SegmentedControl<PageChoice>
                  label="Pages to stamp"
                  value={choice}
                  onValueChange={(c) => (setChoice(c), edit())}
                  options={[
                    { value: "all", label: "All" },
                    { value: "odd", label: "Odd" },
                    { value: "even", label: "Even" },
                    { value: "custom", label: "Choose" },
                  ]}
                />
                {choice === "custom" ? <Field label="Pages" hint="For example 2-5, 8">{(id) => <Input id={id} value={spec} onChange={(e) => (setSpec(e.target.value), edit())} />}</Field> : null}
                <Toggle label="Leave the first page blank" hint="Good for a cover page. Numbers still count it." checked={skipFirst} onCheckedChange={(v) => (setSkipFirst(v), edit())} />
                <Toggle label="Mirror left and right on even pages" hint="For printing double-sided: text meant for the outer edge stays on the outer edge." checked={mirror} onCheckedChange={(v) => (setMirror(v), edit())} />
                {selection.error ? <Alert tone="error">{selection.error}</Alert> : <p className="text-xs text-muted-foreground">{selection.pages.length} of {pageCount} pages will be stamped.</p>}
              </div>
            </div>

            <Preview
              file={source.file}
              pageCount={pageCount}
              pageIndex={pageIndex}
              setPageIndex={setPageIndex}
              geometry={geometry}
              zones={zones}
              sizePt={sizePt}
              marginPt={marginPt}
              color={color}
              mirror={mirror}
              selected={selection.pages}
              ctxBase={{ pageCount, startAt: startNumber, bates: batesOptions, date: dateText, fileName }}
            />
          </div>

          <RunButton busy={job.busy} disabled={filled.length === 0 || !!selection.error} onClick={run}>
            Add header and footer
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-stamped.pdf`} note={`${selection.pages.length} ${selection.pages.length === 1 ? "page" : "pages"} stamped`} /> : null}
    </div>
  );
}

interface PreviewProps {
  file: File;
  pageCount: number;
  pageIndex: number;
  setPageIndex: (n: number) => void;
  geometry: PageGeometry[];
  zones: Zones;
  sizePt: number;
  marginPt: number;
  color: string;
  mirror: boolean;
  selected: number[];
  ctxBase: { pageCount: number; startAt: number; bates: { prefix: string; suffix: string; start: number; digits: number }; date: string; fileName: string };
}

/** The page with the text laid over it, using the same settings. Positions are close, not exact: the saved file is what counts. */
function Preview({ file, pageCount, pageIndex, setPageIndex, geometry, zones, sizePt, marginPt, color, mirror, selected, ctxBase }: PreviewProps) {
  const preview = usePagePreview(file, pageIndex, 700);
  const g = geometry[pageIndex];
  const view = g ? displaySize(g) : { width: 1, height: 1 };
  const position = selected.indexOf(pageIndex);
  const here = position >= 0 ? zonesForPage(zones, pageIndex, mirror) : null;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
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
        className="relative mx-auto block w-full overflow-hidden border border-foreground bg-muted"
        style={{ aspectRatio: `${view.width} / ${view.height}`, maxWidth: `calc(70vh * ${view.width / view.height})`, containerType: "inline-size" } as CSSProperties}
        data-testid="stamp-preview"
      >
        {preview.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
          <img src={preview.url} alt="" className="absolute inset-0 size-full object-fill" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{preview.failed ? "No preview available" : "Drawing page…"}</span>
        )}
        {here
          ? ZONES.flatMap((zone) => {
              const text = expandTokens(here[zone] ?? "", { ...ctxBase, index: pageIndex, stampedBefore: position }).trim();
              if (text === "") return [];
              const [row, side] = zone.split("-") as ["header" | "footer", "left" | "center" | "right"];
              const style: CSSProperties = {
                fontSize: `${(sizePt / view.width) * 100}cqw`,
                color,
                fontFamily: "Helvetica, Arial, sans-serif",
                lineHeight: 1,
                whiteSpace: "nowrap",
                ...(row === "header" ? { top: pct(marginPt, view.height) } : { bottom: pct(marginPt, view.height) }),
                ...(side === "left" ? { left: pct(marginPt, view.width) } : side === "right" ? { right: pct(marginPt, view.width) } : { left: "50%", transform: "translateX(-50%)" }),
              };
              return [
                <span key={zone} aria-hidden className="pointer-events-none absolute" style={style}>
                  {text}
                </span>,
              ];
            })
          : null}
      </div>
      <p className="text-xs text-muted-foreground">{here ? "Preview of the text on this page." : "This page is not stamped."}</p>
    </div>
  );
}
