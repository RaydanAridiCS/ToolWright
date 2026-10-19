"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Badge, Button, DownloadButton, Field, FileDropzone, Panel, Select, Toggle, cn, formatFileSize, useDebounced } from "@toolwright/ui";
import { NumberField, num } from "./number-field";
import { blobToBytes, fitWithin, loadImage, outputName, renderImage, type OutputFormat } from "./image";
import { createZip } from "./zip";
import { errorMessage } from "./format";

export type WorkbenchMode = "compress" | "convert" | "resize";

type FormatChoice = "same" | OutputFormat;
type ResizeMode = "none" | "fit" | "percent" | "exact";

interface Settings {
  format: FormatChoice;
  quality: number;
  resize: ResizeMode;
  maxWidth: string;
  maxHeight: string;
  percent: string;
  width: string;
  height: string;
  lockAspect: boolean;
  background: string;
  fillTransparent: boolean;
}

const PRESETS: Record<WorkbenchMode, Partial<Settings>> = {
  compress: { format: "same", quality: 75, resize: "none" },
  convert: { format: "image/webp", quality: 90, resize: "none" },
  resize: { format: "same", quality: 90, resize: "fit", maxWidth: "1280", maxHeight: "" },
};

const DEFAULTS: Settings = {
  format: "same",
  quality: 80,
  resize: "none",
  maxWidth: "1920",
  maxHeight: "",
  percent: "50",
  width: "800",
  height: "",
  lockAspect: true,
  background: "#ffffff",
  fillTransparent: false,
};

interface Result {
  id: string;
  name: string;
  originalName: string;
  originalSize: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  fellBack: boolean;
  error?: undefined;
}

interface Failure {
  id: string;
  originalName: string;
  error: string;
}

function resolveFormat(choice: FormatChoice, file: File): OutputFormat {
  if (choice !== "same") return choice;
  if (file.type === "image/jpeg" || file.type === "image/webp" || file.type === "image/png" || file.type === "image/avif") return file.type;
  return "image/png";
}

const FORMAT_LABELS: { value: FormatChoice; label: string }[] = [
  { value: "same", label: "Keep original format" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
  { value: "image/avif", label: "AVIF (if supported)" },
];

export function ImageWorkbench({ mode }: { mode: WorkbenchMode }) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS, ...PRESETS[mode] });
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<(Result | Failure)[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const debounced = useDebounced(settings, 350);

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (files.length === 0) {
      setResults([]);
      return;
    }
    setBusy(true);
    (async () => {
      const out: (Result | Failure)[] = [];
      for (const [index, file] of files.entries()) {
        const id = `${index}-${file.name}-${file.size}`;
        try {
          const image = await loadImage(file);
          try {
            const s = debounced;
            let target = { width: image.width, height: image.height };
            if (s.resize === "fit") target = fitWithin(image.width, image.height, { maxWidth: num(s.maxWidth) || undefined, maxHeight: num(s.maxHeight) || undefined, noUpscale: true });
            else if (s.resize === "percent") {
              const p = Math.max(1, Math.min(500, num(s.percent) || 100)) / 100;
              target = { width: image.width * p, height: image.height * p };
            } else if (s.resize === "exact") {
              const w = num(s.width);
              const h = num(s.height);
              const ratio = image.width / image.height;
              if (s.lockAspect) target = Number.isFinite(w) && w > 0 ? { width: w, height: w / ratio } : Number.isFinite(h) && h > 0 ? { width: h * ratio, height: h } : target;
              else target = { width: Number.isFinite(w) && w > 0 ? w : image.width, height: Number.isFinite(h) && h > 0 ? h : image.height };
            }
            const type = resolveFormat(s.format, file);
            const rendered = await renderImage(image, {
              width: target.width,
              height: target.height,
              type,
              quality: s.quality / 100,
              background: type === "image/jpeg" || s.fillTransparent ? s.background : null,
            });
            const url = URL.createObjectURL(rendered.blob);
            urls.current.push(url);
            out.push({
              id,
              name: outputName(file.name, rendered.blob.type || type, mode === "resize" ? `-${rendered.width}x${rendered.height}` : mode === "compress" ? "-compressed" : ""),
              originalName: file.name,
              originalSize: file.size,
              blob: rendered.blob,
              url,
              width: rendered.width,
              height: rendered.height,
              originalWidth: image.width,
              originalHeight: image.height,
              fellBack: rendered.fellBack,
            });
          } finally {
            image.dispose();
          }
        } catch (err) {
          out.push({ id, originalName: file.name, error: errorMessage(err, "This image could not be processed.") });
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setResults((previous) => {
          previous.forEach((r) => "url" in r && (URL.revokeObjectURL(r.url), (urls.current = urls.current.filter((u) => u !== r.url))));
          return out;
        });
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files, debounced, mode]);

  const good = useMemo(() => results.filter((r): r is Result => "blob" in r), [results]);
  const totalBefore = good.reduce((n, r) => n + r.originalSize, 0);
  const totalAfter = good.reduce((n, r) => n + r.blob.size, 0);
  const lossy = settings.format === "same" || settings.format === "image/jpeg" || settings.format === "image/webp" || settings.format === "image/avif";
  const showPngNote = settings.format === "image/png" || (settings.format === "same" && files.some((f) => f.type === "image/png"));

  const zip = async () => {
    const entries = await Promise.all(good.map(async (r) => ({ name: r.name, data: await blobToBytes(r.blob) })));
    return createZip(entries);
  };
  const [zipData, setZipData] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (good.length > 1) void zip().then((z) => !cancelled && setZipData(z));
    else setZipData(null);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [good]);

  return (
    <div className="flex flex-col gap-5">
      <FileDropzone
        accept="image/*"
        multiple
        label="Drop images here, or click to browse"
        hint="JPG, PNG, WebP, GIF, BMP, AVIF and more. Images are processed on your device and never uploaded."
        onReject={setRejected}
        onFiles={(added) => {
          setRejected(null);
          setFiles((current) => [...current, ...added]);
        }}
      />
      {rejected ? <Alert tone="warning">{rejected}</Alert> : null}

      <div className="grid gap-5 rounded-xl border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Output format">
          {(id) => (
            <Select id={id} value={settings.format} onChange={(e) => set({ format: e.target.value as FormatChoice })}>
              {FORMAT_LABELS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={`Quality: ${settings.quality}%`} hint={lossy ? "Lower values make smaller files." : "PNG is lossless, so quality does not apply."}>
          {(id) => <input id={id} type="range" min={10} max={100} step={1} value={settings.quality} disabled={!lossy} onChange={(e) => set({ quality: Number(e.target.value) })} className="accent-primary disabled:opacity-40" />}
        </Field>

        <Field label="Resize">
          {(id) => (
            <Select id={id} value={settings.resize} onChange={(e) => set({ resize: e.target.value as ResizeMode })}>
              <option value="none">Keep original size</option>
              <option value="fit">Fit within a maximum size</option>
              <option value="percent">Scale by percentage</option>
              <option value="exact">Exact dimensions</option>
            </Select>
          )}
        </Field>

        {settings.resize === "fit" ? (
          <>
            <NumberField label="Max width" suffix="px" value={settings.maxWidth} onChange={(maxWidth) => set({ maxWidth })} min={1} />
            <NumberField label="Max height" suffix="px" value={settings.maxHeight} onChange={(maxHeight) => set({ maxHeight })} min={1} placeholder="No limit" />
          </>
        ) : null}
        {settings.resize === "percent" ? <NumberField label="Scale" suffix="%" value={settings.percent} onChange={(percent) => set({ percent })} min={1} max={500} /> : null}
        {settings.resize === "exact" ? (
          <>
            <NumberField label="Width" suffix="px" value={settings.width} onChange={(width) => set({ width })} min={1} />
            <NumberField label="Height" suffix="px" value={settings.height} onChange={(height) => set({ height })} min={1} placeholder={settings.lockAspect ? "Auto" : ""} />
            <Toggle label="Keep aspect ratio" checked={settings.lockAspect} onCheckedChange={(lockAspect) => set({ lockAspect })} />
          </>
        ) : null}

        <div className="flex items-center gap-3">
          <Toggle label="Fill transparency with color" checked={settings.fillTransparent} onCheckedChange={(fillTransparent) => set({ fillTransparent })} />
          <input type="color" aria-label="Background color" value={settings.background} onChange={(e) => set({ background: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-border bg-card p-0.5" />
        </div>
      </div>

      {showPngNote && mode === "compress" ? (
        <Alert tone="info">PNG files are lossless, so only resizing makes them smaller. To shrink them a lot, choose WebP or JPEG above.</Alert>
      ) : null}

      {files.length > 0 ? (
        <Panel
          title={busy ? "Processing…" : `${results.length} image${results.length === 1 ? "" : "s"}`}
          actions={
            <>
              {good.length > 1 && zipData ? <DownloadButton data={zipData} filename="images.zip" mime="application/zip" label="Download all (ZIP)" variant="primary" size="sm" /> : null}
              <Button size="sm" variant="ghost" onClick={() => setFiles([])}>
                Clear
              </Button>
            </>
          }
        >
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Working on {files.length} image{files.length === 1 ? "" : "s"}…
            </p>
          ) : null}
          {good.length > 1 && !busy ? (
            <p className="text-sm text-muted-foreground">
              Total: {formatFileSize(totalBefore)} → <strong className="text-foreground">{formatFileSize(totalAfter)}</strong> ({totalBefore ? Math.round((1 - totalAfter / totalBefore) * 100) : 0}% {totalAfter <= totalBefore ? "smaller" : "larger"})
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {results.map((r) =>
              "error" in r && r.error ? (
                <li key={r.id} className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm">
                  <strong>{r.originalName}</strong>: {r.error}
                </li>
              ) : (
                <ResultItem key={r.id} r={r as Result} />
              ),
            )}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function ResultItem({ r }: { r: Result }) {
  const saved = r.originalSize ? Math.round((1 - r.blob.size / r.originalSize) * 100) : 0;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={r.url} alt={`Preview of ${r.name}`} className="size-16 shrink-0 rounded-md border border-border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px] object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={r.name}>
          {r.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {r.originalWidth}×{r.originalHeight}
          {r.width !== r.originalWidth || r.height !== r.originalHeight ? ` → ${r.width}×${r.height}` : ""} · {formatFileSize(r.originalSize)} → <span className="text-foreground">{formatFileSize(r.blob.size)}</span>
        </p>
        {r.fellBack ? <p className="text-xs text-warning">Your browser cannot encode this format, so a PNG was saved instead.</p> : null}
      </div>
      <Badge tone={saved > 0 ? "success" : saved < 0 ? "danger" : "neutral"} className={cn("tabular-nums")}>
        {saved > 0 ? `−${saved}%` : saved < 0 ? `+${-saved}%` : "same"}
      </Badge>
      <DownloadButton data={r.blob} filename={r.name} mime={r.blob.type} label="Download" variant="outline" size="sm" />
    </li>
  );
}

