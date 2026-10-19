"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, DownloadButton, Field, Panel, Select, Textarea, Toggle, readFileText } from "@toolwright/ui";
import { FileUp } from "lucide-react";
import { NumberField, num } from "../../shared/number-field";
import { errorMessage } from "../../shared/format";

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <rect width="120" height="120" rx="24" fill="#1b1a15"/>
  <path d="M30 78 60 30l30 48H30Z" fill="#fff" opacity=".92"/>
  <circle cx="60" cy="84" r="8" fill="#d8ec4e"/>
</svg>`;

function measure(svg: string): { width: number; height: number } | null {
  try {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
    const vb = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
    const attr = (name: string) => {
      const v = root.getAttribute(name);
      return v && /^[\d.]+(px)?$/.test(v.trim()) ? parseFloat(v) : null;
    };
    const width = attr("width") ?? (vb && vb.length === 4 ? (vb[2] as number) : null);
    const height = attr("height") ?? (vb && vb.length === 4 ? (vb[3] as number) : null);
    return width && height ? { width, height } : { width: 300, height: 150 };
  } catch {
    return null;
  }
}

export default function Tool() {
  const [svg, setSvg] = useState("");
  const [scale, setScale] = useState("2");
  const [format, setFormat] = useState<"image/png" | "image/jpeg" | "image/webp">("image/png");
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [result, setResult] = useState<{ blob: Blob; url: string; width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const size = useMemo(() => (svg.trim() ? measure(svg) : null), [svg]);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (!svg.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    if (!size) {
      setResult(null);
      setError("That does not look like valid SVG markup.");
      return;
    }
    const factor = Math.min(16, Math.max(0.1, num(scale) || 1));
    const width = Math.round(size.width * factor);
    const height = Math.round(size.height * factor);
    if (width * height > 100_000_000) {
      setError("That output size is too large. Try a smaller scale.");
      return;
    }
    const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available.");
        if (!transparent || format === "image/jpeg") {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.92));
        if (!blob) throw new Error("The image could not be encoded.");
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setResult({ blob, url, width, height });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        URL.revokeObjectURL(source);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(source);
      if (!cancelled) {
        setResult(null);
        setError("The SVG could not be rendered. Check that the markup is valid and self-contained.");
      }
    };
    img.src = source;
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [svg, size, scale, format, transparent, background]);

  const ext = format === "image/png" ? "png" : format === "image/jpeg" ? "jpg" : "webp";

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="SVG code"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setSvg(SAMPLE)}>
              Sample
            </Button>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium hover:bg-muted">
              <FileUp className="size-4" /> Open file
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setSvg(await readFileText(f));
                  e.target.value = "";
                }}
              />
            </label>
          </>
        }
      >
        <Textarea aria-label="SVG code" rows={10} value={svg} onChange={(e) => setSvg(e.target.value)} placeholder="<svg xmlns=…>…</svg>" />
      </Panel>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Scale" suffix="×" value={scale} onChange={setScale} min={0.1} max={16} hint={size ? `Source ${size.width}×${size.height}` : undefined} />
        <Field label="Format">
          {(id) => (
            <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </Select>
          )}
        </Field>
        <Toggle label="Transparent background" checked={transparent} onCheckedChange={setTransparent} disabled={format === "image/jpeg"} />
        <Field label="Background color">{(id) => <input id={id} type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card p-1" />}</Field>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {result ? (
        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.url} alt="Rendered output" className="checker max-h-56 max-w-full border border-border object-contain" />
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {result.width} × {result.height}px
            </p>
            <DownloadButton data={result.blob} filename={`image.${ext}`} mime={format} label={`Download ${ext.toUpperCase()}`} variant="primary" size="md" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
