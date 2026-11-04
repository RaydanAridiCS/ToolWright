/**
 * Pixel comparison for the Compare Two Images tool. Works on RGBA bytes, so it stays free of
 * React, the DOM and the network; the tool draws the images onto canvases and hands the bytes over.
 */

export interface ImageDiffOptions {
  /** Differences of this delta or less count as the same. 0 to 255, default 8. */
  threshold?: number;
  /** How many bytes of the mask to build. Default: no mask. */
  withMask?: boolean;
}

export interface ImageDiffResult {
  width: number;
  height: number;
  /** Pixels whose biggest channel difference is at most the threshold. */
  same: number;
  /** Pixels whose biggest channel difference is over the threshold. */
  different: number;
  total: number;
  /** different ÷ total, 0 to 1. */
  percent: number;
  /** Average of the biggest channel difference over every pixel, 0 to 255. */
  averageDelta: number;
  /** The biggest channel difference found, 0 to 255. */
  maxDelta: number;
  /** RGBA bytes marking changed pixels red, in intensity order. Only with `withMask`. */
  mask?: Uint8ClampedArray;
}

/** Biggest channel difference (alpha included) between two RGBA pixels. */
export function pixelDelta(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array, at: number, bytes: number): number {
  let worst = 0;
  for (let c = 0; c < bytes; c++) {
    const d = Math.abs((a[at + c] ?? 0) - (b[at + c] ?? 0));
    if (d > worst) worst = d;
  }
  return worst;
}

/**
 * Compares two same-sized RGBA buffers, 4 bytes per pixel, row by row.
 * Throws when the buffers do not cover the same rectangle.
 */
export function diffPixels(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array, width: number, height: number, options: ImageDiffOptions = {}): ImageDiffResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError("Images must be at least 1 × 1 pixels to compare.");
  const threshold = options.threshold === undefined || !Number.isFinite(options.threshold) ? 8 : Math.min(255, Math.max(0, Math.round(options.threshold)));
  const count = width * height;
  if (a.length < count * 4 || b.length < count * 4) throw new RangeError("The pixel buffers are too small for the given size.");

  let same = 0;
  let max = 0;
  let sum = 0;
  let mask: Uint8ClampedArray | undefined;
  if (options.withMask) mask = new Uint8ClampedArray(count * 4);

  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    const delta = pixelDelta(a, b, at, 4);
    sum += delta;
    if (delta > max) max = delta;
    if (delta <= threshold) {
      same++;
    } else if (mask) {
      // Changed pixels glow in red, scaled by how much they changed.
      mask[at] = 255;
      mask[at + 1] = 255 - delta;
      mask[at + 2] = 255 - delta;
      mask[at + 3] = 255;
    }
  }

  const different = count - same;
  return {
    width,
    height,
    same,
    different,
    total: count,
    percent: count ? different / count : 0,
    averageDelta: count ? sum / count : 0,
    maxDelta: max,
    mask,
  };
}
