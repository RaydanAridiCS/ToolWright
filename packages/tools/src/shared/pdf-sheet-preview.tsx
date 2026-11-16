"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@toolwright/ui";
import type { Placement, SheetSide, Size } from "@toolwright/core/pdf-layout";
import type { ThumbStore } from "./pdf-thumbs";

function usePageUrl(store: ThumbStore | null, page: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!store) return;
    let live = true;
    store.get(page).then(
      (u) => live && setUrl(u),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, page]);
  return url;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function Placed({ store, sheet, p, border }: { store: ThumbStore | null; sheet: Size; p: Placement; border: boolean }) {
  const url = usePageUrl(store, p.page);
  const sideways = p.turn === 90 || p.turn === 270;
  return (
    <span
      className={border ? "absolute outline outline-1 outline-foreground/50" : "absolute"}
      style={{ left: pct(p.x, sheet.width), top: pct(sheet.height - p.y - p.height, sheet.height), width: pct(p.width, sheet.width), height: pct(p.height, sheet.height) }}
    >
      <span
        className="absolute left-1/2 top-1/2 grid place-items-center bg-muted"
        style={{
          // Turned pictures swap sides, so size the unturned picture to the turned box before rotating it.
          width: sideways ? pct(p.height, p.width) : "100%",
          height: sideways ? pct(p.width, p.height) : "100%",
          transform: `translate(-50%, -50%) rotate(${p.turn}deg)`,
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
          <img src={url} alt="" className="size-full object-fill" />
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">{p.page + 1}</span>
        )}
      </span>
    </span>
  );
}

/** One side of a sheet of paper, drawn from page pictures exactly where the PDF will put them. */
export function SheetSidePreview({ store, sheet, side, border = false, label }: { store: ThumbStore | null; sheet: Size; side: SheetSide; border?: boolean; label: string }) {
  const pages = side.placements.map((p) => p.page + 1);
  return (
    <figure className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={`${label}: ${pages.length ? `page${pages.length === 1 ? "" : "s"} ${pages.join(", ")}` : "blank"}.`}
        className="relative w-full overflow-hidden border border-foreground bg-white"
        style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}
      >
        {side.placements.map((p, i) => (
          <Placed key={`${i}-${p.page}`} store={store} sheet={sheet} p={p} border={border} />
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** Previous and next buttons with "Sheet 2 of 7" between them. */
export function SheetPager({ index, count, onChange, noun = "Sheet" }: { index: number; count: number; onChange: (index: number) => void; noun?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" aria-label={`Previous ${noun.toLowerCase()}`} disabled={index <= 0} onClick={() => onChange(index - 1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-24 text-center font-mono text-sm tabular-nums" aria-live="polite">
        {noun} {index + 1} of {count}
      </span>
      <Button type="button" variant="outline" size="sm" aria-label={`Next ${noun.toLowerCase()}`} disabled={index >= count - 1} onClick={() => onChange(index + 1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}
