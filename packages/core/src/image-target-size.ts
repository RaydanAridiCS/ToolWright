/**
 * Search for the image encoding that comes under a size target: highest quality first, then smaller
 * dimensions when no quality can do it. The maths lives here; the browser encodes through a callback.
 * No React, no DOM, no network.
 */

export interface TargetSearchOptions {
  /** Quality probes per size, so the search stops after `maxAttempts` encodes. Default 9. */
  maxAttempts?: number;
  /** How many rounds of shrinking the dimensions are tried beyond the first size. Default 4. */
  maxRounds?: number;
  /** A round must shrink the picture at least this much to be worth another. Default 0.9. */
  minScale?: number;
  /** Never shrink below this side. Default 1. */
  minSide?: number;
}

/** One try: the size that was asked for, the quality, and how big the encoded file came out. */
export interface TargetCandidate {
  width: number;
  height: number;
  /** 0–1. Lossless encoders ignore this number, but the value that was sent is reported. */
  quality: number;
  size: number;
}

export interface TargetSearchResult {
  /** False when even the smallest dimensions and the lowest quality stayed over the target. */
  hit: boolean;
  /** The attempt to save: under the target when `hit`, otherwise the smallest one found. */
  best: TargetCandidate | null;
  /** How many encodes were tried. */
  attempts: number;
  /** How many rounds shrank the picture (0 when the original size already fit). */
  rounds: number;
}

/** The work the tool gives the search: encode and report the byte size, or null when the encoder failed. */
export type TargetEncoder = (width: number, height: number, quality: number) => Promise<{ size: number } | null>;

const LOW_QUALITY = 0.05;

/**
 * Finds the encoding of one image that stays under `target`.
 *
 * Within one size, the quality is bisected between 5% and 100% for the highest value that fits.
 * When no quality fits, the dimensions are scaled by sqrt(target ÷ smallest seen) and the bisection
 * starts again, up to `maxRounds` rounds. Sizes are always whole pixels before encoding.
 */
export async function searchImageUnderTarget(target: number, start: { width: number; height: number }, encode: TargetEncoder, options: TargetSearchOptions = {}): Promise<TargetSearchResult> {
  if (!Number.isFinite(target) || target <= 0) throw new RangeError("Choose a target size of at least 1 kB.");
  const { maxAttempts = 9, maxRounds = 4, minScale = 0.9, minSide = 1 } = options;

  let attempts = 0;
  let rounds = 0;
  let fallback: TargetCandidate | null = null;

  let width = Math.max(minSide, Math.round(start.width));
  let height = Math.max(minSide, Math.round(start.height));

  for (let round = 0; round <= maxRounds; round++) {
    const outcome = await bisectQuality(width, height);
    if (outcome.hit) return { hit: true, best: outcome.hit, attempts, rounds };
    if (outcome.smallest) {
      if (!fallback || outcome.smallest.size < fallback.size) fallback = outcome.smallest;
    } else break; // the encoder failed at every quality; nothing more can be tried
    if (round === maxRounds) break;
    const scale = Math.min(minScale, Math.sqrt(target / outcome.smallest.size));
    const nextWidth = Math.max(minSide, Math.round(width * scale));
    const nextHeight = Math.max(minSide, Math.round(height * scale));
    if ((nextWidth >= width && nextHeight >= height) || scale > 0.999) break; // no room left to shrink
    rounds++;
    width = nextWidth;
    height = nextHeight;
  }
  return { hit: false, best: fallback, attempts, rounds };

  /** Finds the highest quality that fits at one size, and remembers the smallest attempt otherwise. */
  async function bisectQuality(w: number, h: number): Promise<{ hit: TargetCandidate | null; smallest: TargetCandidate | null }> {
    let lo = LOW_QUALITY;
    let hi = 1;
    let hit: TargetCandidate | null = null;
    let smallest: TargetCandidate | null = null;
    for (let i = 0; i === 0 || (i < maxAttempts && hi - lo >= 0.02); i++) {
      const quality = Math.round(((lo + hi) / 2) * 100) / 100;
      attempts++;
      const attempt = await encode(w, h, quality);
      if (!attempt) break; // the encoder gave up; further probes would fail the same way
      const candidate: TargetCandidate = { width: w, height: h, quality, size: attempt.size };
      if (!smallest || candidate.size < smallest.size) smallest = candidate;
      if (attempt.size <= target) {
        hit = candidate; // a good encode: try whether even better quality still fits
        lo = quality;
      } else {
        hi = quality;
      }
    }
    return { hit, smallest };
  }
}
