"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, SegmentedControl, formatFileSize } from "@toolwright/ui";
import { createThumbnailer } from "./pdf-raster";

export interface PdfCompareSliderProps {
  originalFile: File;
  modifiedBytes: Uint8Array;
  pageCount: number;
  originalLabel?: string;
  modifiedLabel?: string;
  originalSize?: number;
  modifiedSize?: number;
}

export function PdfCompareSlider({
  originalFile,
  modifiedBytes,
  pageCount,
  originalLabel = "Original",
  modifiedLabel = "Compressed",
  originalSize,
  modifiedSize,
}: PdfCompareSliderProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [viewMode, setViewMode] = useState<"slider" | "side">("slider");
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [modUrl, setModUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  const modifiedFile = useRef<File | null>(null);
  if (!modifiedFile.current) {
    modifiedFile.current = new File([modifiedBytes as BlobPart], "modified.pdf", { type: "application/pdf" });
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    setRenderError(null);

    let oldOrigUrl: string | null = null;
    let oldModUrl: string | null = null;

    async function loadPage() {
      try {
        const modFile = modifiedFile.current!;
        const [origThumbnailer, modThumbnailer] = await Promise.all([
          createThumbnailer(originalFile, 900),
          createThumbnailer(modFile, 900),
        ]);

        const [origBlob, modBlob] = await Promise.all([
          origThumbnailer.render(pageIndex, 900),
          modThumbnailer.render(pageIndex, 900),
        ]);

        origThumbnailer.dispose();
        modThumbnailer.dispose();

        if (!live) return;

        const u1 = URL.createObjectURL(origBlob);
        const u2 = URL.createObjectURL(modBlob);
        oldOrigUrl = u1;
        oldModUrl = u2;

        setOrigUrl(u1);
        setModUrl(u2);
        setLoading(false);
      } catch (err) {
        if (!live) return;
        setRenderError(err instanceof Error ? err.message : "Could not draw comparison preview.");
        setLoading(false);
      }
    }

    void loadPage();

    return () => {
      live = false;
      if (oldOrigUrl) URL.revokeObjectURL(oldOrigUrl);
      if (oldModUrl) URL.revokeObjectURL(oldModUrl);
    };
  }, [originalFile, pageIndex]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Visual comparison</h3>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1 text-xs">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={pageIndex <= 0 || loading}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="font-mono text-muted-foreground">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={pageIndex >= pageCount - 1 || loading}
                onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <SegmentedControl
          label="Comparison mode"
          value={viewMode}
          onValueChange={(m) => setViewMode(m as "slider" | "side")}
          options={[
            { value: "slider", label: "Split slider" },
            { value: "side", label: "Side by side" },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid h-72 place-items-center rounded-lg border border-border bg-muted/10">
          <p className="text-sm text-muted-foreground animate-pulse">Rendering comparison preview…</p>
        </div>
      ) : renderError ? (
        <div className="p-4 text-center text-sm text-muted-foreground">
          {renderError}
        </div>
      ) : origUrl && modUrl ? (
        viewMode === "slider" ? (
          <div className="flex flex-col gap-3">
            <div className="relative mx-auto inline-block max-w-full select-none overflow-hidden rounded-lg border border-border bg-muted/20">
              {/* Bottom layer: Original */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={origUrl}
                alt={`${originalLabel} page ${pageIndex + 1}`}
                className="block max-h-[60vh] max-w-full object-contain"
              />

              {/* Top layer: Modified (clipped to the left of the slider) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={modUrl}
                  alt={`${modifiedLabel} page ${pageIndex + 1}`}
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Vertical divider line */}
              <div
                aria-hidden
                className="absolute bottom-0 top-0 w-0.5 bg-foreground"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-border bg-card px-1 py-0.5 shadow">
                  <span className="text-[10px] font-mono text-muted-foreground">⟷</span>
                </div>
              </div>

              {/* Badges */}
              <div className="pointer-events-none absolute left-2 top-2 rounded border border-border bg-card/90 px-2 py-0.5 text-xs font-medium shadow">
                {modifiedLabel} {modifiedSize ? `(${formatFileSize(modifiedSize)})` : ""}
              </div>
              <div className="pointer-events-none absolute right-2 top-2 rounded border border-border bg-card/90 px-2 py-0.5 text-xs font-medium shadow">
                {originalLabel} {originalSize ? `(${formatFileSize(originalSize)})` : ""}
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                aria-label="Comparison slider position"
                className="w-64 max-w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Drag the divider or use arrow keys: left is {modifiedLabel.toLowerCase()}, right is {originalLabel.toLowerCase()}.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <figure className="m-0 flex flex-col gap-1.5">
              <figcaption className="text-xs font-medium text-muted-foreground">
                {originalLabel} {originalSize ? `· ${formatFileSize(originalSize)}` : ""}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={origUrl}
                alt={`${originalLabel} page ${pageIndex + 1}`}
                className="max-h-[60vh] w-full rounded-lg border border-border object-contain"
              />
            </figure>

            <figure className="m-0 flex flex-col gap-1.5">
              <figcaption className="text-xs font-medium text-muted-foreground">
                {modifiedLabel} {modifiedSize ? `· ${formatFileSize(modifiedSize)}` : ""}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={modUrl}
                alt={`${modifiedLabel} page ${pageIndex + 1}`}
                className="max-h-[60vh] w-full rounded-lg border border-border object-contain"
              />
            </figure>
          </div>
        )
      ) : null}
    </div>
  );
}
