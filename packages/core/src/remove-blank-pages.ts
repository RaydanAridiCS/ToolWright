/** Logic for the "Remove Blank Pages" tool. Keep this file free of React, the DOM and the network. */

import { deletePages, PdfError } from "./pdf";

export type BlankSensitivity = "strict" | "normal" | "loose";

/**
 * The share of a page (0-1) that may be "ink" before the page counts as having content.
 * Strict: only truly empty pages. Normal: also dust and specks, and a page that holds just a page number.
 * Loose: also a page with only a footer line or a small stamp. A short heading is above every limit.
 *
 * Set from measurements of pages drawn at 500 px (ink counted without lone pixels): an empty page 0, scanner-style dust
 * about 0.004%, a lone page number about 0.005%, a footer line about 0.04%, a short heading about 0.3%.
 */
export const BLANK_LIMITS: Record<BlankSensitivity, number> = { strict: 0.00001, normal: 0.00008, loose: 0.0008 };

export interface InkOptions {
  /** Share of each side, 0-0.2, ignored all round: scanner shadows and punch holes live there. Default 0.03. */
  edge?: number;
  /** How much darker than the paper a pixel must be to count as ink (luminance, 0-255). Default 40. */
  contrast?: number;
  /** Ignore dark pixels that have no dark neighbour (dust, noise). Default true. */
  despeckle?: boolean;
}

/**
 * How much of a page picture is ink (0-1). The paper colour is taken as the most common brightness, so a cream or
 * slightly grey scan is not mistaken for content, and only pixels clearly darker than the paper count.
 * `rgba` is the picture's pixels, 4 bytes each.
 */
export function inkRatio(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, options: InkOptions = {}): number {
  const edge = Math.min(0.2, Math.max(0, options.edge ?? 0.03));
  const contrast = Math.max(1, options.contrast ?? 40);
  const despeckle = options.despeckle ?? true;
  const x0 = Math.floor(width * edge);
  const x1 = width - x0;
  const y0 = Math.floor(height * edge);
  const y1 = height - y0;
  if (x1 <= x0 || y1 <= y0) return 0;

  const w = x1 - x0;
  const h = y1 - y0;
  const histogram = new Uint32Array(256);
  const luminance = new Uint8Array(w * h);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      // A transparent pixel shows the white page behind it.
      const alpha = (rgba[i + 3] as number) / 255;
      const lum = Math.round((0.299 * (rgba[i] as number) + 0.587 * (rgba[i + 1] as number) + 0.114 * (rgba[i + 2] as number)) * alpha + 255 * (1 - alpha));
      luminance[n++] = lum;
      histogram[lum] = (histogram[lum] as number) + 1;
    }
  }
  let paper = 255;
  let best = -1;
  for (let v = 0; v < 256; v++) {
    if ((histogram[v] as number) > best) {
      best = histogram[v] as number;
      paper = v;
    }
  }
  const limit = paper - contrast;
  const dark = (k: number) => (luminance[k] as number) < limit;
  let ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!dark(k)) continue;
      // A lone dark pixel is dust or noise. Ink that is part of a mark touches another dark pixel.
      if (despeckle && !((x > 0 && dark(k - 1)) || (x < w - 1 && dark(k + 1)) || (y > 0 && dark(k - w)) || (y < h - 1 && dark(k + w)))) continue;
      ink++;
    }
  }
  return ink / n;
}

export function isBlank(ratio: number, sensitivity: BlankSensitivity): boolean {
  return ratio <= BLANK_LIMITS[sensitivity];
}

/**
 * Which pages (zero-based) to remove: the ones whose ink is within the sensitivity limit, then any manual choices on top.
 * `overrides` maps a page to `true` (remove it) or `false` (keep it) and wins over the measurement.
 */
export function pagesToRemove(ratios: readonly number[], sensitivity: BlankSensitivity, overrides: ReadonlyMap<number, boolean> = new Map()): number[] {
  const out: number[] = [];
  ratios.forEach((ratio, i) => {
    if (overrides.get(i) ?? isBlank(ratio, sensitivity)) out.push(i);
  });
  return out;
}

/** Remove the given pages. Refuses to remove every page. */
export async function removeBlankPages(bytes: Uint8Array, pageIndexes: number[]): Promise<Uint8Array> {
  if (pageIndexes.length === 0) throw new PdfError("No pages are marked for removal.");
  return deletePages(bytes, pageIndexes);
}
