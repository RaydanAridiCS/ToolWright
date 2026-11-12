/**
 * Logic for the "Redact PDF" tool.
 *
 * The only safe way to redact in a browser is to remove the text itself, not to draw a black box over it: a box
 * on top of live text leaves the words in the file for anyone to select, search or copy. So every page that has a
 * box is drawn as a picture with the boxes painted into the pixels, and the page is rebuilt from that picture alone.
 * The covered words, and the fonts and text commands that held them, are not in the result at all.
 *
 * This file holds the parts that need no canvas: checking and rounding the boxes, finding text to mark, and
 * assembling the new PDF. Drawing and painting happen in the tool, where the canvas is. Keep this file free of
 * React, the DOM and the network.
 */
import { PDFDocument } from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";

/** A rectangle to black out, in points, on the page as the reader sees it, measured from the page's top-left corner. */
export interface RedactBox {
  /** Zero-based page number. */
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const REDACT_LIMITS = {
  maxBoxes: 2000,
  /** Pages that may be drawn as pictures in one run. */
  maxRasterPages: 300,
  /** Smallest box side kept, in points. Anything thinner would not hide a line of text. */
  minSide: 1,
} as const;

export type RedactQuality = "smaller" | "balanced" | "sharpest";

export interface QualityInfo {
  label: string;
  hint: string;
  dpi: number;
  format: "jpeg" | "png";
  /** 0 to 1, for JPEG. */
  jpeg: number;
}

export const QUALITIES: Record<RedactQuality, QualityInfo> = {
  smaller: { label: "Smaller file", hint: "150 dpi JPEG. Fine for reading on screen.", dpi: 150, format: "jpeg", jpeg: 0.85 },
  balanced: { label: "Balanced", hint: "200 dpi JPEG. Sharp text, moderate size.", dpi: 200, format: "jpeg", jpeg: 0.92 },
  sharpest: { label: "Sharpest", hint: "300 dpi PNG. Best for printing, largest file.", dpi: 300, format: "png", jpeg: 1 },
};

export interface PageSize {
  width: number;
  height: number;
}

/** Padding added around every box, in points, so the antialiased edge of a letter next to it is covered too. */
export const BOX_PADDING = 1;

/** Keep only the part of each box that lies on its page. Throws when a box has no size or is not on the page at all. */
export function clampBoxes(boxes: readonly RedactBox[], sizes: readonly PageSize[]): RedactBox[] {
  if (boxes.length > REDACT_LIMITS.maxBoxes) throw new PdfError(`At most ${REDACT_LIMITS.maxBoxes} boxes can be redacted in one run.`);
  return boxes.map((box, i) => {
    const size = sizes[box.page];
    const label = `Box ${i + 1}`;
    if (!Number.isInteger(box.page) || !size) throw new PdfError(`${label} is on page ${box.page + 1}, which this PDF does not have.`);
    if (![box.left, box.top, box.width, box.height].every(Number.isFinite)) throw new PdfError(`${label} needs a position and a size.`);
    const left = Math.max(0, box.left);
    const top = Math.max(0, box.top);
    const right = Math.min(size.width, box.left + box.width);
    const bottom = Math.min(size.height, box.top + box.height);
    if (right <= left || bottom <= top) throw new PdfError(`${label} is outside page ${box.page + 1}. Move it onto the page or remove it.`);
    if (right - left < REDACT_LIMITS.minSide || bottom - top < REDACT_LIMITS.minSide) throw new PdfError(`${label} is thinner than 1 point and would hide nothing. Make it larger or remove it.`);
    return { page: box.page, left, top, width: right - left, height: bottom - top };
  });
}

/** Zero-based pages that must be drawn as pictures: the pages with a box, or every page. */
export function pagesToRasterise(boxes: readonly RedactBox[], pageCount: number, everyPage: boolean): number[] {
  if (everyPage) return Array.from({ length: pageCount }, (_, i) => i);
  return [...new Set(boxes.map((b) => b.page))].sort((a, b) => a - b);
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The boxes of one page as whole-pixel rectangles on a picture of that page. Edges are rounded outwards and padded, so
 * the black always covers at least what was marked, and a box never ends halfway through a pixel of text.
 */
export function boxPixelRects(boxes: readonly RedactBox[], page: PageSize, pixelWidth: number, pixelHeight: number): PixelRect[] {
  const sx = pixelWidth / page.width;
  const sy = pixelHeight / page.height;
  return boxes.map((b) => {
    const x0 = Math.max(0, Math.floor((b.left - BOX_PADDING) * sx));
    const y0 = Math.max(0, Math.floor((b.top - BOX_PADDING) * sy));
    const x1 = Math.min(pixelWidth, Math.ceil((b.left + b.width + BOX_PADDING) * sx));
    const y1 = Math.min(pixelHeight, Math.ceil((b.top + b.height + BOX_PADDING) * sy));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
}

/** One page drawn as a picture, with the black boxes already painted into it. */
export interface RasterPage {
  image: Uint8Array;
  kind: "jpeg" | "png";
  /** Page size in points as the reader sees it; the new page has this size and no rotation. */
  widthPt: number;
  heightPt: number;
}

/**
 * Build the result: pages in `rasters` are replaced by their pictures; every other page is copied as it was.
 * Nothing else is carried over from the original (no bookmarks, form fields, attachments, scripts or properties).
 */
export async function assembleRedacted(original: Uint8Array, rasters: ReadonlyMap<number, RasterPage>): Promise<Uint8Array> {
  const source = await loadPdf(original);
  const count = source.getPageCount();
  if (rasters.size === 0) throw new PdfError("There is nothing to redact. Mark an area first.");
  for (const index of rasters.keys()) if (!Number.isInteger(index) || index < 0 || index >= count) throw new PdfError(`Page ${index + 1} does not exist in this PDF.`);

  const out = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const raster = rasters.get(i);
    if (!raster) {
      const [copy] = await out.copyPages(source, [i]);
      if (copy) out.addPage(copy);
      continue;
    }
    let picture;
    try {
      picture = raster.kind === "png" ? await out.embedPng(raster.image) : await out.embedJpg(raster.image);
    } catch {
      throw new PdfError(`Page ${i + 1} could not be saved as a picture.`);
    }
    const page = out.addPage([raster.widthPt, raster.heightPt]);
    page.drawImage(picture, { x: 0, y: 0, width: raster.widthPt, height: raster.heightPt });
  }
  // The new file starts with no title, author or keywords, and says only that this tool made it.
  out.setProducer("Toolwright");
  out.setCreator("Toolwright");
  return out.save({ useObjectStreams: true });
}

/* ----------------------------------------------------------------------------------------------- */
/* Finding text to mark                                                                             */
/* ----------------------------------------------------------------------------------------------- */

export type SearchKind = "text" | "email" | "numbers";

export interface SearchSpec {
  kind: SearchKind;
  /** The words to find, for kind "text". */
  term: string;
  matchCase: boolean;
}

export const SEARCH_KINDS: Record<SearchKind, string> = {
  text: "These words",
  email: "Email addresses",
  numbers: "Phone, ID and account numbers",
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pattern for a search, or null when there is nothing to look for yet. */
export function searchPattern(spec: SearchSpec): RegExp | null {
  if (spec.kind === "email") return /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
  // Seven or more digits, which may be split by spaces, dots, dashes or brackets: phone, ID, card and account numbers.
  if (spec.kind === "numbers") return /\+?\d(?:[\d ().-]{5,}\d)/g;
  const term = spec.term.trim();
  if (term === "") return null;
  return new RegExp(escapeRegex(term), spec.matchCase ? "g" : "gi");
}

/** A piece of page text as PDF.js reports it. */
export interface TextItemLike {
  str: string;
  /** Text-space matrix `[a, b, c, d, e, f]`. */
  transform: readonly number[];
  /** Advance width in unscaled page units. */
  width: number;
  /** Text direction as PDF.js reports it. Right-to-left pieces are always covered whole. */
  dir?: string;
  /** PDF.js's name for the piece's font, so `share` can look the real letters up. */
  font?: string;
}

/**
 * Where, as a share of one piece's width (0 to 1), the characters `from` to `to` of its text start and end.
 * Return null when that cannot be known, and the whole piece is covered. Leaving a letter showing is the worst
 * thing a redaction can do, so covering too much is always the right way to fail.
 */
export type ShareOfPiece = (item: TextItemLike, from: number, to: number) => readonly [number, number] | null;

/** Matrix product, the same as PDF.js's `Util.transform(m, n)`. */
export function multiplyMatrix(m: readonly number[], n: readonly number[]): number[] {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = m;
  const [g = 0, h = 0, i = 0, j = 0, k = 0, l = 0] = n;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

export interface MatchBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The text that was found. */
  text: string;
}

const ASCENT = 1.0;
const DESCENT = 0.25;

/**
 * Boxes, in points on the page as shown, around every match of `spec` in one page's text. `viewport` is the 6-number
 * transform that maps page space to the picture at `scale` (PDF.js's `viewport.transform`), so rotated pages work.
 *
 * Matches are found in the text of the page joined in reading order, so a word PDF.js split into two pieces is still
 * found. Where a match covers only part of a piece, `share` says which part of the piece's width it occupies; the tool
 * measures the real letters for this. Without `share` the characters are assumed to be equally wide, which is only
 * right for fixed-width text and is used for tests, never by the tool.
 */
export function matchBoxes(items: readonly TextItemLike[], viewport: readonly number[], scale: number, spec: SearchSpec, pad = 1.5, share?: ShareOfPiece): MatchBox[] {
  const pattern = searchPattern(spec);
  if (!pattern || !(scale > 0)) return [];
  const starts: number[] = [];
  let joined = "";
  for (const item of items) {
    starts.push(joined.length);
    joined += item.str;
  }
  const boxes: MatchBox[] = [];
  for (const match of joined.matchAll(pattern)) {
    const from = match.index;
    const to = from + match[0].length;
    if (match[0].length === 0) continue;
    items.forEach((item, k) => {
      const a = starts[k] as number;
      const b = a + item.str.length;
      if (item.str.length === 0 || b <= from || a >= to || !(item.width > 0)) return;
      const subFrom = Math.max(from, a) - a;
      const subTo = Math.min(to, b) - a;
      let range: readonly [number, number] | null = [subFrom / item.str.length, subTo / item.str.length];
      if (item.dir === "rtl") range = null;
      else if (share) range = share(item, subFrom, subTo);
      const [f0, f1] = range ? [Math.max(0, Math.min(range[0], range[1])), Math.min(1, Math.max(range[0], range[1]))] : [0, 1];
      const t = multiplyMatrix(viewport, item.transform);
      const advance = item.width * scale;
      const ax = t[0] as number;
      const ay = t[1] as number;
      const norm = Math.hypot(ax, ay);
      if (!(norm > 0)) return;
      const dx = (ax / norm) * advance;
      const dy = (ay / norm) * advance;
      const ux = t[2] as number;
      const uy = t[3] as number;
      const x0 = (t[4] as number) + dx * f0;
      const y0 = (t[5] as number) + dy * f0;
      const x1 = (t[4] as number) + dx * f1;
      const y1 = (t[5] as number) + dy * f1;
      const xs = [x0 - DESCENT * ux, x0 + ASCENT * ux, x1 - DESCENT * ux, x1 + ASCENT * ux];
      const ys = [y0 - DESCENT * uy, y0 + ASCENT * uy, y1 - DESCENT * uy, y1 + ASCENT * uy];
      const left = Math.min(...xs) / scale - pad;
      const top = Math.min(...ys) / scale - pad;
      boxes.push({ left, top, width: Math.max(...xs) / scale - left + pad, height: Math.max(...ys) / scale - top + pad, text: match[0] });
    });
  }
  return boxes;
}

/** Drop a box that sits inside another one marked on the same page (a repeat of the same search). */
export function dedupeBoxes<T extends { page: number; left: number; top: number; width: number; height: number }>(boxes: readonly T[]): T[] {
  const inside = (a: T, b: T) => a.page === b.page && a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.left + a.width <= b.left + b.width + 0.5 && a.top + a.height <= b.top + b.height + 0.5;
  return boxes.filter((box, i) => !boxes.some((other, j) => j !== i && inside(box, other) && (!inside(other, box) || j < i)));
}
