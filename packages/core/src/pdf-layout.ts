/**
 * Page layout for the "N-up PDF", "PDF Booklet" and "Resize PDF Pages" tools.
 *
 * The layout functions (`nUpLayout`, `bookletLayout`, `resizePlacement`) are pure geometry, so a tool can draw an
 * exact preview of each sheet from page pictures before anything is made. `nUpPdf` and `bookletPdf` draw every page
 * onto new sheets as a Form XObject (the page itself, still sharp text and vectors, not a picture). `resizePdf`
 * changes the pages in place, so links, form fields and comments keep working.
 *
 * Coordinates are PDF points with the origin at the bottom-left of a sheet as you look at it.
 */
import {
  concatTransformationMatrix,
  clip,
  drawObject,
  endPath,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFEmbeddedPage,
  type PDFPage,
} from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Turn = 0 | 90 | 180 | 270;

export const MM = 72 / 25.4;

/** Paper sizes in points, portrait. */
export const SHEET_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  a3: { width: 841.89, height: 1190.55 },
  a5: { width: 419.53, height: 595.28 },
  legal: { width: 612, height: 1008 },
  tabloid: { width: 792, height: 1224 },
} as const satisfies Record<string, Size>;

export type SheetSizeId = keyof typeof SHEET_SIZES;

export const SHEET_NAMES: Record<SheetSizeId, string> = {
  a4: "A4",
  letter: "US Letter",
  a3: "A3",
  a5: "A5",
  legal: "US Legal",
  tabloid: "Tabloid",
};

export type Orientation = "auto" | "portrait" | "landscape";

const portrait = (s: Size): Size => ({ width: Math.min(s.width, s.height), height: Math.max(s.width, s.height) });
const landscape = (s: Size): Size => ({ width: Math.max(s.width, s.height), height: Math.min(s.width, s.height) });
const oriented = (s: Size, o: "portrait" | "landscape") => (o === "portrait" ? portrait(s) : landscape(s));
const turned = (s: Size, turn: Turn): Size => (turn === 90 || turn === 270 ? { width: s.height, height: s.width } : s);
const snap = (deg: number): Turn => ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Turn;

/** A source page drawn onto a sheet. */
export interface Placement {
  /** Zero-based page of the source PDF. */
  page: number;
  /** Extra clockwise turn on top of the page's own rotation, to fit the space better. */
  turn: Turn;
  /** The scale the page is drawn at (1 = actual size). */
  scale: number;
  /** Where the page lands on the sheet, as shown. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetSide {
  placements: Placement[];
  /** For a booklet: which sheet of paper (one-based) and which side this is. */
  label?: string;
}

export interface SheetLayout {
  sheet: Size;
  sides: SheetSide[];
}

type Align = "center" | "start" | "end";

/** Scale `size` (turned if that fits better and `allowTurn`) to fit `box`, aligned horizontally as asked and centred vertically. */
export function fitInto(size: Size, box: Rect, options: { allowTurn?: boolean; align?: Align; cover?: boolean } = {}): Omit<Placement, "page"> {
  const { allowTurn = false, align = "center", cover = false } = options;
  const scaleFor = (s: Size) => (cover ? Math.max : Math.min)(box.width / s.width, box.height / s.height);
  let turn: Turn = 0;
  let scale = scaleFor(size);
  if (allowTurn) {
    // Turned counter-clockwise (top to the left), as landscape tables are printed in books. Only when clearly better.
    const other = scaleFor(turned(size, 270));
    if (other > scale * 1.01) {
      turn = 270;
      scale = other;
    }
  }
  const shown = turned(size, turn);
  const width = shown.width * scale;
  const height = shown.height * scale;
  const x = align === "start" ? box.x : align === "end" ? box.x + box.width - width : box.x + (box.width - width) / 2;
  return { turn, scale, x, y: box.y + (box.height - height) / 2, width, height };
}

/* ------------------------------------------------------------------ N-up */

export type NUpCount = 2 | 4 | 6 | 8 | 9 | 12 | 16;
export const NUP_COUNTS: readonly NUpCount[] = [2, 4, 6, 8, 9, 12, 16];
/** Columns by rows on a landscape sheet; a portrait sheet swaps them. */
const GRIDS: Record<NUpCount, [number, number]> = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 12: [4, 3], 16: [4, 4] };

export type NUpOrder = "across" | "down" | "across-rtl";

export interface NUpOptions {
  perSheet: NUpCount;
  /** Paper size, or "auto" for the size of the first page. */
  sheet?: "auto" | SheetSizeId | Size;
  orientation?: Orientation;
  /** Across then down (default), down then across, or right to left then down. */
  order?: NUpOrder;
  /** Space around the sheet, in points. */
  margin?: number;
  /** Space between pages, in points. */
  gap?: number;
  /** Turn pages that fit their space better the other way round. Default true. */
  autoTurn?: boolean;
  /** Fill each sheet with copies of one page (for cards and labels) instead of putting consecutive pages on it. */
  repeat?: boolean;
}

export function gridFor(perSheet: NUpCount, orientation: "portrait" | "landscape"): { cols: number; rows: number } {
  const [long, short] = GRIDS[perSheet];
  return orientation === "landscape" ? { cols: long, rows: short } : { cols: short, rows: long };
}

function cellsOf(sheet: Size, cols: number, rows: number, margin: number, gap: number, order: NUpOrder): Rect[] {
  const width = (sheet.width - 2 * margin - (cols - 1) * gap) / cols;
  const height = (sheet.height - 2 * margin - (rows - 1) * gap) / rows;
  if (!(width > 4 && height > 4)) throw new PdfError("The margins and gaps leave no room for the pages. Make them smaller.");
  const cells: Rect[] = [];
  for (let k = 0; k < cols * rows; k++) {
    let c: number;
    let r: number;
    if (order === "down") {
      r = k % rows;
      c = Math.floor(k / rows);
    } else {
      c = order === "across-rtl" ? cols - 1 - (k % cols) : k % cols;
      r = Math.floor(k / cols);
    }
    cells.push({ x: margin + c * (width + gap), y: sheet.height - margin - (r + 1) * height - r * gap, width, height });
  }
  return cells;
}

function baseSheet(sheet: NUpOptions["sheet"], first: Size): Size {
  if (!sheet || sheet === "auto") return first;
  if (typeof sheet === "string") return SHEET_SIZES[sheet];
  return sheet;
}

/** Lay `pages` (the size of each page as shown) onto sheets, `perSheet` to a sheet. */
export function nUpLayout(pages: readonly Size[], options: NUpOptions): SheetLayout {
  const { perSheet, orientation = "auto", order = "across", margin = 0, gap = 0, autoTurn = true, repeat = false } = options;
  if (!GRIDS[perSheet]) throw new PdfError("Choose 2, 4, 6, 8, 9, 12 or 16 pages per sheet.");
  const first = pages[0];
  if (!first) throw new PdfError("This PDF has no pages.");
  if (!(margin >= 0 && gap >= 0)) throw new PdfError("Margins and gaps must be zero or more.");
  const base = baseSheet(options.sheet, first);

  const layoutFor = (o: "portrait" | "landscape") => {
    const sheet = oriented(base, o);
    const { cols, rows } = gridFor(perSheet, o);
    return { sheet, cells: cellsOf(sheet, cols, rows, margin, gap, order) };
  };
  let chosen: ReturnType<typeof layoutFor>;
  if (orientation === "auto") {
    // The way round that shows the first page biggest; on a tie, the one that does not turn it.
    const tries = (["landscape", "portrait"] as const).flatMap((o) => {
      try {
        const l = layoutFor(o);
        return [{ l, fit: fitInto(first, l.cells[0] as Rect, { allowTurn: autoTurn }) }];
      } catch {
        return [];
      }
    });
    const better = (a: (typeof tries)[number], b: (typeof tries)[number]) =>
      a.fit.scale > b.fit.scale * 1.01 || (a.fit.scale * 1.01 >= b.fit.scale && !a.fit.turn && !!b.fit.turn);
    const best = tries.reduce<(typeof tries)[number] | null>((kept, t) => (!kept || better(t, kept) ? t : kept), null);
    // Neither way round fits: say why.
    chosen = best ? best.l : layoutFor("portrait");
  } else chosen = layoutFor(orientation);

  const { sheet, cells } = chosen;
  const sides: SheetSide[] = [];
  if (repeat) {
    pages.forEach((size, page) => sides.push({ placements: cells.map((cell) => ({ page, ...fitInto(size, cell, { allowTurn: autoTurn }) })) }));
  } else {
    for (let start = 0; start < pages.length; start += cells.length) {
      const placements: Placement[] = [];
      for (let k = 0; k < cells.length && start + k < pages.length; k++) {
        placements.push({ page: start + k, ...fitInto(pages[start + k] as Size, cells[k] as Rect, { allowTurn: autoTurn }) });
      }
      sides.push({ placements });
    }
  }
  return { sheet, sides };
}

/* ------------------------------------------------------------- Booklet */

export interface BookletOptions {
  /** Paper size (used landscape, two pages side by side), or "auto" for two of the first page side by side. */
  sheet?: "auto" | SheetSizeId | Size;
  /** Left for left-to-right languages; right for Arabic, Hebrew, Japanese manga and so on. */
  binding?: "left" | "right";
  /** Where the blank pages that round the booklet up to a multiple of 4 go. */
  blanks?: "end" | "before-back";
  /** Pages in each folded section (a multiple of 4), or 0 for a single booklet. Thick booklets fold better in sections. */
  section?: number;
  /** Space around the sheet, in points. */
  margin?: number;
  /** Space on each side of the fold, in points. */
  gutter?: number;
}

/** Which page goes on each half of each side, in printing order. `null` is a blank page. */
export function bookletOrder(pageCount: number, options: Pick<BookletOptions, "binding" | "blanks" | "section"> = {}): { sides: [number | null, number | null][]; blanks: number; sections: number } {
  const { binding = "left", blanks = "end", section = 0 } = options;
  if (pageCount < 1) throw new PdfError("This PDF has no pages.");
  if (!Number.isInteger(section) || section < 0 || section % 4 !== 0) throw new PdfError("Pages per section must be a multiple of 4.");
  const per = section || Math.ceil(pageCount / 4) * 4;
  const full = Math.floor(pageCount / per);
  const total = full * per + Math.ceil((pageCount - full * per) / 4) * 4;
  const blankCount = total - pageCount;
  const seq: (number | null)[] = Array.from({ length: pageCount }, (_, i) => i);
  const fill = Array<null>(blankCount).fill(null);
  if (blanks === "before-back" && pageCount > 1) seq.splice(pageCount - 1, 0, ...fill);
  else seq.push(...fill);

  const sides: [number | null, number | null][] = [];
  let sections = 0;
  for (let start = 0; start < seq.length; start += per) {
    const part = seq.slice(start, start + per);
    const m = part.length;
    sections++;
    for (let s = 0; s < m / 4; s++) {
      const front: [number | null, number | null] = [part[m - 1 - 2 * s] ?? null, part[2 * s] ?? null];
      const back: [number | null, number | null] = [part[2 * s + 1] ?? null, part[m - 2 - 2 * s] ?? null];
      for (const side of [front, back]) sides.push(binding === "right" ? [side[1], side[0]] : side);
    }
  }
  return { sides, blanks: blankCount, sections };
}

/** Lay pages out for a folded booklet: each sheet holds four pages, two on each side. */
export function bookletLayout(pages: readonly Size[], options: BookletOptions = {}): SheetLayout & { blanks: number; sections: number } {
  const { margin = 0, gutter = 0 } = options;
  const first = pages[0];
  if (!first) throw new PdfError("This PDF has no pages.");
  if (!(margin >= 0 && gutter >= 0)) throw new PdfError("Margins must be zero or more.");
  const sheet = !options.sheet || options.sheet === "auto" ? { width: first.width * 2, height: first.height } : landscape(typeof options.sheet === "string" ? SHEET_SIZES[options.sheet] : options.sheet);
  const half = sheet.width / 2;
  const left: Rect = { x: margin, y: margin, width: half - margin - gutter, height: sheet.height - 2 * margin };
  const right: Rect = { x: half + gutter, y: margin, width: half - margin - gutter, height: sheet.height - 2 * margin };
  if (!(left.width > 4 && left.height > 4)) throw new PdfError("The margins leave no room for the pages. Make them smaller.");
  const order = bookletOrder(pages.length, options);
  const perSheetOfPaper = 2;
  const sides: SheetSide[] = order.sides.map(([l, r], i) => {
    const placements: Placement[] = [];
    // Pages sit against the fold, so a spread reads as one even when pages differ in size.
    if (l !== null) placements.push({ page: l, ...fitInto(pages[l] as Size, left, { align: "end" }) });
    if (r !== null) placements.push({ page: r, ...fitInto(pages[r] as Size, right, { align: "start" }) });
    return { placements, label: `Sheet ${Math.floor(i / perSheetOfPaper) + 1}, ${i % 2 === 0 ? "front" : "back"}` };
  });
  return { sheet, sides, blanks: order.blanks, sections: order.sections };
}

/* ----------------------------------------------------- Drawing sheets */

const ANNOT_HIDDEN = 2;
const ANNOT_NO_VIEW = 32;

function numbers(array: PDFArray | undefined): number[] | null {
  if (!array) return null;
  const out: number[] = [];
  for (let i = 0; i < array.size(); i++) {
    const n = array.lookup(i);
    if (!(n instanceof PDFNumber)) return null;
    out.push(n.asNumber());
  }
  return out;
}

/**
 * Draw what each annotation shows (form entries, stamps, comments, highlights) into the page itself, so it survives
 * being drawn onto another sheet. Annotations that are hidden or have no appearance are left alone. Returns how many were drawn.
 */
export function drawAnnotationAppearances(doc: PDFDocument, pageIndexes: Iterable<number>): number {
  if (doc.catalog.has(PDFName.of("AcroForm"))) {
    try {
      // Fields filled in by a viewer that only set NeedAppearances have nothing to draw until their appearance is made.
      doc.getForm().updateFieldAppearances();
    } catch {
      // A field with an odd font keeps the appearance it has.
    }
  }
  const pages = doc.getPages();
  let drawn = 0;
  for (const index of pageIndexes) {
    const page = pages[index];
    const annots = page?.node.Annots();
    if (!page || !annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      const subtype = annot.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText();
      if (subtype === "Popup" || subtype === "Link") continue;
      const flags = annot.lookupMaybe(PDFName.of("F"), PDFNumber)?.asNumber() ?? 0;
      if (flags & (ANNOT_HIDDEN | ANNOT_NO_VIEW)) continue;
      if (drawAppearance(doc, page, annot)) drawn++;
    }
  }
  return drawn;
}

/**
 * Draws one annotation's normal appearance into the page content, where it shows (PDF 32000-1, 12.5.5). Returns
 * false when it has no appearance to draw. The annotation itself is left in place.
 */
export function drawAppearance(doc: PDFDocument, page: PDFPage, annot: PDFDict): boolean {
  const ap = annot.lookupMaybe(PDFName.of("AP"), PDFDict);
  if (!ap) return false;
  let raw = ap.get(PDFName.of("N"));
  let normal = ap.lookup(PDFName.of("N"));
  if (normal instanceof PDFDict && !(normal instanceof PDFStream)) {
    const state = annot.lookupMaybe(PDFName.of("AS"), PDFName);
    if (!state) return false;
    raw = normal.get(state);
    normal = normal.lookup(state);
  }
  if (!(normal instanceof PDFStream)) return false;
  const rect = numbers(annot.lookupMaybe(PDFName.of("Rect"), PDFArray));
  const bbox = numbers(normal.dict.lookupMaybe(PDFName.of("BBox"), PDFArray));
  if (!rect || rect.length < 4 || !bbox || bbox.length < 4) return false;
  const m = numbers(normal.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray)) ?? [1, 0, 0, 1, 0, 0];
  // The appearance box after its own matrix, then stretched onto the annotation's rectangle (PDF 32000-1, 12.5.5).
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ].map(([x, y]) => [(m[0] as number) * (x as number) + (m[2] as number) * (y as number) + (m[4] as number), (m[1] as number) * (x as number) + (m[3] as number) * (y as number) + (m[5] as number)]);
  const xs = corners.map((c) => c[0] as number);
  const ys = corners.map((c) => c[1] as number);
  const [bx0, bx1, by0, by1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [rx0, rx1, ry0, ry1] = [Math.min(rect[0] as number, rect[2] as number), Math.max(rect[0] as number, rect[2] as number), Math.min(rect[1] as number, rect[3] as number), Math.max(rect[1] as number, rect[3] as number)];
  if (bx1 - bx0 <= 0 || by1 - by0 <= 0 || rx1 - rx0 <= 0 || ry1 - ry0 <= 0) return false;
  const sx = (rx1 - rx0) / (bx1 - bx0);
  const sy = (ry1 - ry0) / (by1 - by0);
  if (!normal.dict.has(PDFName.of("Subtype"))) {
    normal.dict.set(PDFName.of("Type"), PDFName.of("XObject"));
    normal.dict.set(PDFName.of("Subtype"), PDFName.of("Form"));
  }
  const ref = raw instanceof PDFRef ? raw : doc.context.register(normal);
  const name = page.node.newXObject("Annot", ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, rx0 - sx * bx0, ry0 - sy * by0), drawObject(name), popGraphicsState());
  return true;
}

/** Maps the embedded page (its visible box moved to 0,0) onto the sheet: turned clockwise by `turn`, scaled, then moved. */
export function placementMatrix(box: Size, turn: Turn, scale: number, x: number, y: number): [number, number, number, number, number, number] {
  const { width: w, height: h } = box;
  const base: Record<Turn, [number, number, number, number, number, number]> = {
    0: [1, 0, 0, 1, 0, 0],
    90: [0, -1, 1, 0, 0, w],
    180: [-1, 0, 0, -1, w, h],
    270: [0, 1, -1, 0, h, 0],
  };
  const [a, b, c, d, e, f] = base[turn];
  return [a * scale, b * scale, c * scale, d * scale, e * scale + x, f * scale + y];
}

export interface SheetsOptions {
  /** A thin line round each page. */
  border?: boolean;
  /** Draw form entries and comments into the pages first, so they show on the sheets. Default true. */
  keepAnnotations?: boolean;
  /** Make only these sides (zero-based), for a quick preview of one sheet. */
  onlySides?: readonly number[];
}

/** The size of each page as shown: its visible box, turned by its own rotation. */
export function shownSizes(doc: PDFDocument): Size[] {
  return doc.getPages().map((p) => turned(p.getCropBox(), snap(p.getRotation().angle)));
}

async function drawSheets(src: PDFDocument, layout: SheetLayout, options: SheetsOptions): Promise<Uint8Array> {
  const { border = false, keepAnnotations = true, onlySides } = options;
  const sides = onlySides ? onlySides.map((i) => layout.sides[i]).filter((s): s is SheetSide => !!s) : layout.sides;
  const pages = src.getPages();
  const used = [...new Set(sides.flatMap((s) => s.placements.map((p) => p.page)))].sort((a, b) => a - b);
  if (keepAnnotations) drawAnnotationAppearances(src, used);
  // A page with nothing on it (no content stream) cannot be embedded; it simply stays blank on the sheet.
  const drawable = used.filter((i) => pages[i]?.node.Contents());
  const out = await PDFDocument.create();
  const embedded = await out.embedPages(
    drawable.map((i) => pages[i] as PDFPage),
    drawable.map((i) => {
      const b = (pages[i] as PDFPage).getCropBox();
      return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
    }),
  );
  const byPage = new Map<number, PDFEmbeddedPage>(drawable.map((p, k) => [p, embedded[k] as PDFEmbeddedPage]));
  for (const side of sides) {
    const sheet = out.addPage([layout.sheet.width, layout.sheet.height]);
    for (const p of side.placements) {
      const source = pages[p.page] as PDFPage;
      const emb = byPage.get(p.page);
      if (emb) {
        const box = source.getCropBox();
        const turn = snap(source.getRotation().angle + p.turn);
        const name = sheet.node.newXObject("Page", emb.ref);
        sheet.pushOperators(pushGraphicsState(), concatTransformationMatrix(...placementMatrix(box, turn, p.scale, p.x, p.y)), drawObject(name), popGraphicsState());
      }
      if (border) sheet.drawRectangle({ x: p.x, y: p.y, width: p.width, height: p.height, borderColor: rgb(0.45, 0.45, 0.45), borderWidth: 0.5 });
    }
  }
  const title = src.getTitle();
  if (title) out.setTitle(title);
  const author = src.getAuthor();
  if (author) out.setAuthor(author);
  return out.save({ useObjectStreams: true });
}

export interface NUpResult {
  data: Uint8Array;
  sheets: number;
}

/** Put several pages on each sheet. */
export async function nUpPdf(bytes: Uint8Array, options: NUpOptions & SheetsOptions): Promise<NUpResult> {
  const src = await loadPdf(bytes);
  const layout = nUpLayout(shownSizes(src), options);
  return { data: await drawSheets(src, layout, options), sheets: layout.sides.length };
}

export interface BookletResult {
  data: Uint8Array;
  /** Sheets of paper (each printed on both sides). */
  sheets: number;
  blanks: number;
  sections: number;
}

/** Impose a PDF as a saddle-stitched booklet: print double-sided (flip on the short edge), fold, and staple. */
export async function bookletPdf(bytes: Uint8Array, options: BookletOptions & SheetsOptions = {}): Promise<BookletResult> {
  const src = await loadPdf(bytes);
  const layout = bookletLayout(shownSizes(src), options);
  return { data: await drawSheets(src, layout, options), sheets: layout.sides.length / 2, blanks: layout.blanks, sections: layout.sections };
}

/* -------------------------------------------------------------- Resize */

export type ResizeFit = "fit" | "fill" | "none";

export interface ResizeOptions {
  size: SheetSizeId | Size;
  /** "auto" keeps each page's own orientation. */
  orientation?: Orientation;
  /** Fit: shrink or grow to fit, nothing cut off. Fill: cover the page, edges may be cut off. None: keep the size and centre it. */
  fit?: ResizeFit;
  /** Space kept clear round the content when fitting, in points. */
  margin?: number;
  /** Zero-based pages to resize. Every page when omitted. */
  pageIndexes?: readonly number[];
}

/** The new page size for a page shown at `page`, as shown. */
export function targetSize(page: Size, size: SheetSizeId | Size, orientation: Orientation = "auto"): Size {
  const base = typeof size === "string" ? SHEET_SIZES[size] : size;
  const o = orientation === "auto" ? (page.width > page.height ? "landscape" : "portrait") : orientation;
  return oriented(base, o);
}

/** Where the content of a page shown at `page` lands on a page of `target`, as shown. */
export function resizePlacement(page: Size, target: Size, fit: ResizeFit = "fit", margin = 0): Omit<Placement, "page" | "turn"> {
  const box: Rect = fit === "fit" ? { x: margin, y: margin, width: target.width - 2 * margin, height: target.height - 2 * margin } : { x: 0, y: 0, ...target };
  if (fit === "fit" && !(box.width > 4 && box.height > 4)) throw new PdfError("The margin leaves no room for the page. Make it smaller.");
  if (fit === "none") return { scale: 1, x: (target.width - page.width) / 2, y: (target.height - page.height) / 2, width: page.width, height: page.height };
  const { scale, x, y, width, height } = fitInto(page, box, { cover: fit === "fill" });
  return { scale, x, y, width, height };
}

/** Move every point pair in an annotation's geometry by the same affine map as the content. */
function transformAnnotations(page: PDFPage, s: number, tx: number, ty: number): void {
  const annots = page.node.Annots();
  if (!annots) return;
  const doc = page.doc;
  for (let i = 0; i < annots.size(); i++) {
    const annot = annots.lookupMaybe(i, PDFDict);
    if (!annot) continue;
    for (const key of ["Rect", "QuadPoints", "Vertices", "L", "CL"]) {
      const arr = annot.lookupMaybe(PDFName.of(key), PDFArray);
      const ns = numbers(arr);
      if (!ns) continue;
      annot.set(PDFName.of(key), doc.context.obj(ns.map((v, k) => (k % 2 === 0 ? s * v + tx : s * v + ty))));
    }
    const ink = annot.lookupMaybe(PDFName.of("InkList"), PDFArray);
    if (ink) {
      const paths: number[][] = [];
      for (let k = 0; k < ink.size(); k++) {
        const ns = numbers(ink.lookupMaybe(k, PDFArray));
        if (ns) paths.push(ns.map((v, j) => (j % 2 === 0 ? s * v + tx : s * v + ty)));
      }
      annot.set(PDFName.of("InkList"), doc.context.obj(paths));
    }
  }
}

export interface ResizeResult {
  data: Uint8Array;
  resized: number;
}

/**
 * Change the paper size of the chosen pages. The content is scaled and moved inside each page (nothing is redrawn),
 * links, form fields and comments move with it, and each page keeps its rotation.
 */
export async function resizePdf(bytes: Uint8Array, options: ResizeOptions): Promise<ResizeResult> {
  const { size, orientation = "auto", fit = "fit", margin = 0, pageIndexes } = options;
  if (typeof size !== "string" && !(size.width >= 36 && size.height >= 36 && size.width <= 14400 && size.height <= 14400)) {
    throw new PdfError("Choose a page size between 0.5 inch (13 mm) and 200 inches on each side.");
  }
  if (!(margin >= 0)) throw new PdfError("The margin must be zero or more.");
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const targets = pageIndexes ? [...new Set(pageIndexes)] : pages.map((_, i) => i);
  if (targets.length === 0) throw new PdfError("No pages selected.");
  for (const i of targets) if (!Number.isInteger(i) || !pages[i]) throw new PdfError(`Page ${i + 1} does not exist (this PDF has ${pages.length} pages).`);
  for (const i of targets) {
    const page = pages[i] as PDFPage;
    const box = page.getCropBox();
    const rotation = snap(page.getRotation().angle);
    const shown = turned(box, rotation);
    const target = targetSize(shown, size, orientation);
    // Fitting is the same in the page's own (unturned) space, because both boxes turn together.
    const own = turned(target, rotation);
    const fitted = resizePlacement(turned(shown, rotation), own, fit, margin);
    const s = fitted.scale;
    const tx = fitted.x - s * box.x;
    const ty = fitted.y - s * box.y;
    const start = doc.context.register(
      doc.context.contentStream([pushGraphicsState(), concatTransformationMatrix(s, 0, 0, s, tx, ty), rectangle(box.x, box.y, box.width, box.height), clip(), endPath()]),
    );
    const end = doc.context.register(doc.context.contentStream([popGraphicsState()]));
    // A single content stream becomes an array first, or there is nothing to wrap.
    page.node.normalize();
    page.node.wrapContentStreams(start, end);
    transformAnnotations(page, s, tx, ty);
    for (const name of ["CropBox", "BleedBox", "TrimBox", "ArtBox"]) page.node.delete(PDFName.of(name));
    page.setMediaBox(0, 0, own.width, own.height);
  }
  return { data: await doc.save({ useObjectStreams: true }), resized: targets.length };
}

/** The size of each page of a PDF as shown, for laying out a preview before anything is made. */
export async function readPageSizes(bytes: Uint8Array): Promise<Size[]> {
  return shownSizes(await loadPdf(bytes));
}
