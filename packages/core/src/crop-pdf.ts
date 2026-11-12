/** Logic for the "Crop PDF" tool. Keep this file free of React, the DOM and the network. */

import { PDFName } from "pdf-lib";
import { displayToPageSpace, loadPdf, PdfError } from "./pdf";

export type CropUnit = "mm" | "in" | "pt";

/** Space to remove from each side, in points, measured on the page as the reader sees it (after any rotation). */
export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CropOptions {
  margins: CropMargins;
  /** Zero-based pages to crop. Every page when omitted. */
  pageIndexes?: number[];
  /** Also shrink the page size (MediaBox), not just the visible area (CropBox). Default true. */
  resizePage?: boolean;
}

const POINTS_PER_UNIT: Record<CropUnit, number> = { pt: 1, in: 72, mm: 72 / 25.4 };

/** The smallest page, in points, that a crop may leave. */
export const MIN_CROPPED_SIZE = 10;

export function toPoints(value: number, unit: CropUnit): number {
  return value * POINTS_PER_UNIT[unit];
}

export function fromPoints(points: number, unit: CropUnit): number {
  return points / POINTS_PER_UNIT[unit];
}

export const NO_MARGINS: CropMargins = { top: 0, right: 0, bottom: 0, left: 0 };

/** Size of the visible page: the crop box turned by the page's `/Rotate`. */
export function displaySize(box: { width: number; height: number }, rotation: number): { width: number; height: number } {
  return displayToPageSpace({ x: 0, y: 0, ...box }, rotation, 0, 0).view;
}

/**
 * The new page rectangle, in the page's own coordinates, after trimming `margins` off the displayed page.
 * Works for rotated pages and for boxes that do not start at 0,0.
 */
export function croppedRect(box: { x: number; y: number; width: number; height: number }, rotation: number, margins: CropMargins): { x: number; y: number; width: number; height: number } {
  const view = displaySize(box, rotation);
  const a = displayToPageSpace(box, rotation, margins.left, margins.bottom);
  const b = displayToPageSpace(box, rotation, view.width - margins.right, view.height - margins.top);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** How big each page looks to the reader, in points: the crop box turned by `/Rotate`. */
export async function pageDisplaySizes(bytes: Uint8Array): Promise<{ width: number; height: number }[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((page) => displaySize(page.getCropBox(), page.getRotation().angle));
}

export function validateMargins(margins: CropMargins): void {
  for (const [side, value] of Object.entries(margins)) {
    if (!Number.isFinite(value) || value < 0) throw new PdfError(`The ${side} margin must be a number that is zero or more.`);
  }
}

/** True when the margins would leave a page too small to be useful. Used by the screen to warn before running. */
export function tooMuchCropped(view: { width: number; height: number }, margins: CropMargins): boolean {
  return view.width - margins.left - margins.right < MIN_CROPPED_SIZE || view.height - margins.top - margins.bottom < MIN_CROPPED_SIZE;
}

/**
 * Trim the visible area of the chosen pages.
 *
 * This sets the page's CropBox, which every viewer and printer respects, and (by default) its MediaBox too. The
 * hidden parts are still stored in the file, so this is not a way to hide sensitive content.
 */
export async function cropPdf(bytes: Uint8Array, options: CropOptions): Promise<Uint8Array> {
  const { margins, pageIndexes, resizePage = true } = options;
  validateMargins(margins);
  if (margins.top + margins.right + margins.bottom + margins.left === 0) throw new PdfError("Enter how much to trim from at least one side.");
  const doc = await loadPdf(bytes);
  const count = doc.getPageCount();
  const targets = pageIndexes ? Array.from(new Set(pageIndexes)) : doc.getPageIndices();
  if (targets.length === 0) throw new PdfError("No pages selected.");
  for (const i of targets) {
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new PdfError(`Page ${i + 1} does not exist (this PDF has ${count} pages).`);
  }
  for (const i of targets) {
    const page = doc.getPage(i);
    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    if (tooMuchCropped(displaySize(box, rotation), margins)) throw new PdfError(`Page ${i + 1} would be left with almost nothing. Trim less.`);
    const rect = croppedRect(box, rotation, margins);
    page.setCropBox(rect.x, rect.y, rect.width, rect.height);
    if (resizePage) page.setMediaBox(rect.x, rect.y, rect.width, rect.height);
    // Trim, bleed and art boxes that reach outside the new page only confuse print workflows.
    for (const name of ["TrimBox", "BleedBox", "ArtBox"]) page.node.delete(PDFName.of(name));
  }
  return doc.save({ useObjectStreams: true });
}

/**
 * Find the margins that remove the blank border around a page picture.
 * `rgba` is the picture's pixels; a pixel counts as content when any colour channel is below `threshold` (0-255).
 * Returns the share (0-1) of the picture to trim from each side, or null when the page is blank.
 */
export function detectBlankMargins(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 245, padding = 0.01): { top: number; right: number; bottom: number; left: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((rgba[i] as number) < threshold || (rgba[i + 1] as number) < threshold || (rgba[i + 2] as number) < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    left: clamp(minX / width - padding),
    right: clamp((width - 1 - maxX) / width - padding),
    top: clamp(minY / height - padding),
    bottom: clamp((height - 1 - maxY) / height - padding),
  };
}
