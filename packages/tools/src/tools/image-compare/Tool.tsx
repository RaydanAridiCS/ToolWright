"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert, Badge, Button, FileDropzone, Panel, SegmentedControl, Stat, StatGrid, formatFileSize } from "@toolwright/ui";
import { diffPixels } from "@toolwright/core/image-compare";
import { loadImage, type LoadedImage } from "../../shared/image";
import { errorMessage } from "../../shared/format";

type Mode = "slider" | "side" | "diff";

interface Picture {
  name: string;
  size: number;
  type: string;
  url: string;
  width: number;
  height: number;
  source: CanvasImageSource;
  dispose: () => void;
}

/** Difference view and statistics are computed on at most this many pixels; larger samples are scaled. */
const SAMPLE_LIMIT = 8_000_000;

const MODES: { value: Mode; label: string }[] = [
  { value: "slider", label: "Overlay" },
  { value: "side", label: "Side by side" },
  { value: "diff", label: "Difference" },
];

function FileChip({ picture, side, busy, onRemove, onOpen, onReject }: { picture: Picture | null; side: "a" | "b"; busy: boolean; onRemove: () => void; onOpen: (file: File) => void; onReject: (message: string) => void }) {
  const name = `Picture ${side.toUpperCase()}`;
  return picture ? (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={picture.url} alt={`${name}: ${picture.name}`} className="checker size-12 shrink-0 border border-border object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={picture.name}>
          {picture.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {picture.width} × {picture.height} px · {formatFileSize(picture.size)} · {picture.type.replace("image/", "").toUpperCase()}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove picture ${side.toUpperCase()}`}>
        <X aria-hidden /> Remove
      </Button>
    </div>
  ) : (
    <FileDropzone
      accept="image/*"
      label={`${name}: ${busy ? "Opening…" : "drop a picture, or click to browse"}`}
      hint="The picture is processed in this tab and never uploaded."
      disabled={busy}
      onReject={onReject}
      onFiles={([file]) => file && onOpen(file)}
    />
  );
}

export default function Tool() {
  const [a, setA] = useState<Picture | null>(null);
  const [b, setB] = useState<Picture | null>(null);
  const [mode, setMode] = useState<Mode>("slider");
  const [slider, setSlider] = useState(50);
  const [threshold, setThreshold] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [aBusy, setABusy] = useState(false);
  const [bBusy, setBBusy] = useState(false);
  const diffCanvas = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof diffPixels>> | null>(null);
  const [statError, setStatError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  // Dispose the previous picture's decoder when a new one replaces it, or on unmount.
  useEffect(
    () => () => {
      a?.dispose();
    },
    [a],
  );
  useEffect(
    () => () => {
      b?.dispose();
    },
    [b],
  );

  async function open(side: "a" | "b", file: File) {
    if (side === "a") setABusy(true);
    else setBBusy(true);
    setError(null);
    try {
      const image: LoadedImage = await loadImage(file);
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      // The decoded image data survives the internal blob URL being revoked, so the source stays usable.
      const picture: Picture = { name: file.name, size: file.size, type: file.type || "image", url, width: image.width, height: image.height, source: image.source, dispose: image.dispose };
      if (side === "a") setA(picture);
      else setB(picture);
    } catch (err) {
      setError(errorMessage(err, "This picture could not be opened."));
    } finally {
      if (side === "a") setABusy(false);
      else setBBusy(false);
    }
  }

  const release = (side: "a" | "b") => {
    if (side === "a") setA(null);
    else setB(null);
  };

  const sameSize = Boolean(a && b && a.width === b.width && a.height === b.height);
  const sample = useMemo(() => {
    if (!a || !b) return null;
    if (!sameSize) return null;
    const pixels = a.width * a.height;
    if (pixels <= SAMPLE_LIMIT) return { width: a.width, height: a.height, scaled: false };
    const scale = Math.sqrt(SAMPLE_LIMIT / pixels);
    return { width: Math.max(1, Math.round(a.width * scale)), height: Math.max(1, Math.round(a.height * scale)), scaled: true };
  }, [a, b, sameSize]);

  // Read pixels and compare, whenever both pictures are ready and settings change.

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setStatError(null);
    if (!a || !b || !sameSize || !sample) {
      return;
    }
    const canvasFor = (picture: Picture) => {
      const canvas = document.createElement("canvas");
      canvas.width = sample.width;
      canvas.height = sample.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Your browser does not support canvas, which this tool needs.");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(picture.source, 0, 0, sample.width, sample.height);
      return ctx.getImageData(0, 0, sample.width, sample.height).data;
    };
    (async () => {
      try {
        const left = canvasFor(a);
        const right = canvasFor(b);
        if (cancelled) return;
        if (mode === "diff") {
          const result = diffPixels(left, right, sample.width, sample.height, { threshold, withMask: true });
          if (cancelled) return;
          setStats(result);
        } else {
          setStats(diffPixels(left, right, sample.width, sample.height, { threshold }));
        }
      } catch (err) {
        if (!cancelled) setStatError(errorMessage(err, "The pictures could not be compared."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [a, b, sameSize, sample, mode, threshold]);

  // Paint the difference view.
  useEffect(() => {
    const canvas = diffCanvas.current;
    if (mode !== "diff" || !canvas || !stats?.mask || !sample) return;
    canvas.width = sample.width;
    canvas.height = sample.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.style.aspectRatio = `${a?.width ?? 1} / ${a?.height ?? 1}`;
    const data = new Uint8ClampedArray(stats.mask); // a copy also satisfies the ImageData constructor's buffer type
    ctx.putImageData(new ImageData(data, sample.width, sample.height), 0, 0);
  }, [mode, stats, sample, a]);

  const pct = slider;

  return (
    <div className="flex flex-col gap-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <FileChip picture={a} side="a" busy={aBusy} onRemove={() => release("a")} onOpen={(f) => void open("a", f)} onReject={setError} />
        <FileChip picture={b} side="b" busy={bBusy} onRemove={() => release("b")} onOpen={(f) => void open("b", f)} onReject={setError} />
      </div>

      {a && b ? (
        <>
          {!sameSize ? (
            <Alert tone="warning">
              The sizes differ ({a.width} × {a.height} against {b.width} × {b.height}), so the overlay stretches and the difference view is not available.
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4">
            <SegmentedControl<Mode> label="View" value={mode} onValueChange={setMode} options={MODES} />
            {mode === "diff" && sameSize ? (
              <span className="flex items-center gap-2 text-sm">
                <Badge tone="neutral">Threshold</Badge>
                <input
                  type="range"
                  aria-label="Ignore differences up to this strength"
                  min={0}
                  max={64}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-40 accent-primary"
                />
                <span className="tabular-nums text-sm text-muted-foreground">{threshold}</span>
              </span>
            ) : null}
          </div>

          <Panel title="Compare">
            {mode === "side" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <figure className="m-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={`Picture A: ${a.name}`} className="max-h-[70vh] w-full border border-border object-contain checker" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">A · {a.name}</figcaption>
                </figure>
                <figure className="m-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt={`Picture B: ${b.name}`} className="max-h-[70vh] w-full border border-border object-contain checker" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">B · {b.name}</figcaption>
                </figure>
              </div>
            ) : null}

            {mode === "slider" ? (
              <div className="flex flex-col gap-3">
                <div className="relative inline-block max-w-full select-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={`Picture A: ${a.name}`} className="block max-h-[70vh] max-w-full checker" />
                  <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.url} alt={`Picture B: ${b.name} (shown on the left of the divider)`} className="h-full w-full object-contain checker" />
                  </div>
                  <div aria-hidden className="absolute bottom-0 top-0 w-0.5 bg-foreground" style={{ left: `${pct}%` }} />
                </div>
                <input
                  type="range"
                  aria-label="Divider position between picture A and picture B"
                  min={0}
                  max={100}
                  step={1}
                  value={slider}
                  onChange={(e) => setSlider(Number(e.target.value))}
                  className="mx-auto block w-64 accent-primary"
                />
                <p className="text-xs text-muted-foreground">Picture B fills from the left up to the divider; picture A shows the rest. Move the slider, or use the arrow keys.</p>
              </div>
            ) : null}

            {mode === "diff" ? (
              sameSize ? (
                <div className="flex flex-col gap-3">
                  <canvas ref={diffCanvas} role="img" aria-label="Difference map: changed pixels are marked red" className="checker mx-auto block h-auto max-h-[70vh] max-w-full" />
                  <p className="text-xs text-muted-foreground">Changed pixels are marked red; brighter red means a bigger change. Unchanged pixels are transparent.</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">The difference view needs both pictures with the same dimensions.</p>
              )
            ) : null}
          </Panel>

          {stats ? (
            <StatGrid className="sm:grid-cols-4">
              <Stat label="Changed pixels" value={`${(stats.percent * 100).toFixed(1)}%`} />
              <Stat label="Changed of total" value={`${stats.different.toLocaleString("en-US")} of ${stats.total.toLocaleString("en-US")}`} />
              <Stat label="Average change" value={stats.averageDelta.toFixed(1)} />
              <Stat label="Biggest change" value={String(stats.maxDelta)} />
            </StatGrid>
          ) : null}
          {statError ? <Alert tone="error">{statError}</Alert> : null}
          {sample?.scaled ? (
            <p className="text-xs text-muted-foreground">The picture is so large that the statistics sample it at {sample.width} × {sample.height} pixels.</p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Drop two pictures above to compare them. Pick the same picture twice to check a compressed copy against the original.</p>
      )}
    </div>
  );
}
