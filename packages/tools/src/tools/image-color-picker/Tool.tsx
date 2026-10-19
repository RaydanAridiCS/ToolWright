"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, CopyButton, FileDropzone, Panel } from "@toolwright/ui";
import { formatColor, readableTextColor, rgbToHex, type RGBA } from "@toolwright/core/color";
import { loadImage } from "../../shared/image";
import { errorMessage } from "../../shared/format";

const MAX_DISPLAY = 720;

/** Group pixels into coarse color buckets and return the most common ones. */
function dominantColors(data: Uint8ClampedArray, count = 6): RGBA[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] as number) < 128) continue;
    const r = data[i] as number;
    const g = data[i + 1] as number;
    const b = data[i + 2] as number;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    buckets.set(key, bucket);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const picked: RGBA[] = [];
  for (const b of sorted) {
    const c = { r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), a: 1 };
    // Skip near-duplicates of colors we already have.
    if (picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 40)) continue;
    picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}

export default function Tool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<RGBA[]>([]);
  const [hover, setHover] = useState<RGBA | null>(null);
  const [palette, setPalette] = useState<RGBA[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const image = await loadImage(file);
        if (cancelled) return image.dispose();
        const scale = Math.min(1, MAX_DISPLAY / Math.max(image.width, image.height));
        const canvas = canvasRef.current;
        if (!canvas) return image.dispose();
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        image.dispose();
        setPalette(dominantColors(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const sample = useCallback((event: React.PointerEvent<HTMLCanvasElement>): RGBA | null => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    return { r: r as number, g: g as number, b: b as number, a: Math.round(((a as number) / 255) * 100) / 100 };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {file ? null : <FileDropzone accept="image/*" label="Drop an image here, or click to browse" hint="Colors are read on your device. The image is never uploaded." onReject={setError} onFiles={([f]) => (setError(null), f && setFile(f))} />}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {file ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              aria-label="Image. Click to pick a color."
              className="max-h-[70vh] w-full cursor-crosshair rounded-xl border border-border bg-muted object-contain"
              style={{ imageRendering: "auto" }}
              onPointerMove={(e) => setHover(sample(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const c = sample(e as unknown as React.PointerEvent<HTMLCanvasElement>);
                if (c) setPicked((p) => [c, ...p].slice(0, 12));
              }}
            />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{hover ? <>Under cursor: <code className="font-mono text-foreground">{rgbToHex(hover)}</code></> : "Hover to preview, click to pick."}</span>
              <Button size="sm" variant="ghost" onClick={() => (setFile(null), setPicked([]), setPalette([]))}>
                Choose another image
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <Panel title="Dominant colors">
              <div className="grid grid-cols-3 gap-2">
                {palette.map((c, i) => (
                  <Swatch key={i} color={c} />
                ))}
              </div>
            </Panel>
            <Panel title={`Picked colors (${picked.length})`} actions={picked.length ? <CopyButton text={picked.map((c) => rgbToHex(c)).join("\n")} label="Copy all" /> : null}>
              {picked.length === 0 ? <p className="text-sm text-muted-foreground">Click the image to pick colors.</p> : null}
              <ul className="flex flex-col gap-2">
                {picked.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                    <span className="size-10 shrink-0 rounded-md border border-border" style={{ background: rgbToHex(c) }} />
                    <div className="min-w-0 flex-1 font-mono text-xs">
                      <p className="text-sm font-semibold">{formatColor(c).hex}</p>
                      <p className="truncate text-muted-foreground">{formatColor(c).rgb}</p>
                    </div>
                    <CopyButton text={formatColor(c).hex} label="" size="sm" variant="ghost" aria-label={`Copy ${formatColor(c).hex}`} />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Swatch({ color }: { color: RGBA }) {
  const hex = rgbToHex(color);
  return (
    <button
      type="button"
      title={`Copy ${hex}`}
      onClick={() => void navigator.clipboard?.writeText(hex)}
      className="flex aspect-square flex-col justify-end rounded-lg border border-border p-1.5 text-left font-mono text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{ background: hex, color: readableTextColor(color) }}
    >
      {hex}
    </button>
  );
}
