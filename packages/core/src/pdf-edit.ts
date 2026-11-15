/**
 * Edit PDF: put text, pictures, shapes, lines and arrows, highlights, whiteout, freehand ink and check marks on pages,
 * and replace a line of existing text by covering it and writing new words in its place.
 *
 * Everything is drawn into the pages themselves (not as comments that some viewers hide), so the result looks the
 * same in every reader and when printed. Positions are in points on the page as it is shown (left from the left edge,
 * top down from the top edge), like Sign PDF; a page stored turned by 90, 180 or 270 degrees gets a matrix that
 * maps that view onto its own coordinates, so edits land where they were placed and text stays upright.
 *
 * The page editor draws its preview from the same helpers (`layoutText`, `inkPath`, `arrowHead`, `markPath`), so what is
 * on screen is what is saved. Keep this file free of React, the DOM and the network.
 */
import { BlendMode, LineCapStyle, LineJoinStyle, PDFDocument, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb, setLineJoin, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";
import { displaySize, type PageGeometry } from "./pdf-sign";
import { createTextPainter, standardFontName, type FontFamily, type FontLoader, type TextPainter } from "./pdf-text";
import { multiplyMatrix } from "./redact-pdf";

export type { FontFamily } from "./pdf-text";

/** A colour with each channel from 0 to 1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type TextAlign = "left" | "center" | "right";

interface Placed {
  /** Zero-based page number. */
  page: number;
}

interface Boxed extends Placed {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** An area painted over the original words of a line that is being replaced. */
export interface Cover {
  left: number;
  top: number;
  width: number;
  height: number;
  color: Rgb;
}

export interface TextEdit extends Placed {
  kind: "text";
  left: number;
  top: number;
  /** Width of the box. Lines longer than this wrap onto the next line. */
  width: number;
  /** Line breaks (\n) start new lines. */
  text: string;
  /** Font size in points. */
  size: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: Rgb;
  align: TextAlign;
  /** Distance between baselines as a multiple of the size. */
  lineHeight: number;
  opacity: number;
  /** Set when this text replaces a line of the original page: that line is covered, beneath every other edit on the page. */
  cover?: Cover;
}

export interface ShapeEdit extends Boxed {
  kind: "rect" | "ellipse";
  stroke: Rgb | null;
  fill: Rgb | null;
  strokeWidth: number;
  opacity: number;
}

export type ArrowHeads = "none" | "end" | "both";

export interface LineEdit extends Placed {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Rgb;
  strokeWidth: number;
  opacity: number;
  arrow: ArrowHeads;
}

export interface InkEdit extends Placed {
  kind: "ink";
  /** x, y pairs. */
  points: number[];
  color: Rgb;
  strokeWidth: number;
  opacity: number;
}

export interface HighlightEdit extends Boxed {
  kind: "highlight";
  color: Rgb;
  /** Highlights multiply with the page, like a marker pen: black text under them stays black. */
  opacity: number;
}

export interface WhiteoutEdit extends Boxed {
  kind: "whiteout";
  color: Rgb;
}

export interface ImageEdit extends Boxed {
  kind: "image";
  /** PNG or JPEG bytes. The same bytes placed on several pages are stored once. */
  image: Uint8Array;
  opacity: number;
}

export type MarkSymbol = "check" | "cross" | "dot";

export interface MarkEdit extends Placed {
  kind: "mark";
  symbol: MarkSymbol;
  left: number;
  top: number;
  /** Width and height of the square the mark sits in. */
  size: number;
  color: Rgb;
  opacity: number;
}

export type EditObject = TextEdit | ShapeEdit | LineEdit | InkEdit | HighlightEdit | WhiteoutEdit | ImageEdit | MarkEdit;
export type EditKind = EditObject["kind"];

export const EDIT_LIMITS = {
  maxObjects: 5000,
  maxInkPoints: 20000,
  maxTextLength: 20000,
  minFontSize: 4,
  maxFontSize: 200,
  maxStrokeWidth: 50,
} as const;

/* ----------------------------------------------------------------------------------------------- */
/* Text layout, shared by the preview and the PDF                                                    */
/* ----------------------------------------------------------------------------------------------- */

/** Where the first baseline sits below the top of a line, as a share of the font size (the rest of the line is shared out evenly). */
export const TEXT_ASCENT = 0.78;
/** Where an underline sits below the baseline, and how thick it is, as shares of the font size (Helvetica's own values). */
export const UNDERLINE_OFFSET = 0.1;
export const UNDERLINE_THICKNESS = 0.05;

/** Measures a piece of text at size 1, in points. */
export type Measure = (text: string) => number;

/**
 * Break text into lines that fit `maxWidth` (at size 1, so pass width / size). Line breaks in the text always start a
 * line; long lines break between words, and a word longer than the whole width breaks between letters. Spaces at the
 * end of a wrapped line are dropped, so they do not push centred or right-aligned text sideways.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  const fits = (s: string) => measure(s) <= maxWidth + 1e-6;
  for (const paragraph of text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    let line = "";
    const started = out.length;
    for (const token of paragraph.match(/\s+|\S+/g) ?? []) {
      if (/^\s/.test(token)) {
        // Keep spaces inside a line and an indent at the start of a paragraph; drop them where a line wraps.
        if (line !== "" || out.length === started) line += token;
        continue;
      }
      if (line.trim() !== "" && !fits(line + token)) {
        out.push(line.trimEnd());
        line = "";
      }
      let word = token;
      while (!fits(line + word)) {
        const chars = Array.from(word);
        if (chars.length <= 1) break;
        let n = 0;
        while (n < chars.length && fits(line + chars.slice(0, n + 1).join(""))) n++;
        if (n === 0) {
          if (line.trim() !== "") {
            out.push(line.trimEnd());
            line = "";
            continue;
          }
          n = 1;
        }
        out.push(line + chars.slice(0, n).join(""));
        line = "";
        word = chars.slice(n).join("");
      }
      line += word;
    }
    out.push(line.trimEnd());
  }
  return out;
}

export interface LaidLine {
  text: string;
  /** Left end of the line, in points on the page as shown. */
  x: number;
  /** Baseline, in points down from the top of the page. */
  baseline: number;
  width: number;
}

export interface TextLayout {
  lines: LaidLine[];
  /** Height of the whole box. */
  height: number;
}

/** Where each line of a text box goes. `measure` works at size 1. */
export function layoutText(t: Pick<TextEdit, "text" | "left" | "top" | "width" | "size" | "align" | "lineHeight">, measure: Measure): TextLayout {
  const size = t.size;
  const lineHeight = t.lineHeight > 0 ? t.lineHeight : 1.2;
  const rows = wrapText(t.text, t.width / size, measure);
  const lines = rows.map((text, i) => {
    const width = measure(text) * size;
    const x = t.align === "center" ? t.left + (t.width - width) / 2 : t.align === "right" ? t.left + t.width - width : t.left;
    return { text, x, width, baseline: t.top + size * ((lineHeight - 1) / 2 + TEXT_ASCENT + i * lineHeight) };
  });
  return { lines, height: rows.length * size * lineHeight };
}

/** The `top` that puts the first baseline of a text box at `baseline`. */
export const topForBaseline = (baseline: number, size: number, lineHeight: number) => baseline - size * ((lineHeight - 1) / 2 + TEXT_ASCENT);

/**
 * Measures text in the standard PDF fonts exactly as the saved file will, for the editor's preview. Returns null for
 * text those fonts cannot print (it is printed in Noto Sans; the editor measures that on a canvas).
 */
export async function createStandardMeasurer(): Promise<(text: string, family: FontFamily, bold: boolean, italic: boolean) => number | null> {
  const doc = await PDFDocument.create();
  const fonts = new Map<string, PDFFont>();
  for (const family of ["sans", "serif", "mono"] as const) {
    for (const bold of [false, true]) for (const italic of [false, true]) fonts.set(`${family}${bold}${italic}`, await doc.embedFont(standardFontName(family, bold, italic)));
  }
  return (text, family, bold, italic) => {
    try {
      return (fonts.get(`${family}${bold}${italic}`) as PDFFont).widthOfTextAtSize(text, 1);
    } catch {
      return null;
    }
  };
}

/* ----------------------------------------------------------------------------------------------- */
/* Shapes, shared by the preview and the PDF (SVG path data in points on the page as shown)          */
/* ----------------------------------------------------------------------------------------------- */

const f2 = (n: number) => String(Math.round(n * 100) / 100);

/** A smooth path through freehand points: straight to the first midpoint, then curves through each point to the next midpoint. */
export function inkPath(points: readonly number[]): string {
  const n = Math.floor(points.length / 2);
  if (n === 0) return "";
  const x = (i: number) => points[i * 2] as number;
  const y = (i: number) => points[i * 2 + 1] as number;
  if (n === 1) return `M${f2(x(0))} ${f2(y(0))}L${f2(x(0))} ${f2(y(0))}`;
  if (n === 2) return `M${f2(x(0))} ${f2(y(0))}L${f2(x(1))} ${f2(y(1))}`;
  let d = `M${f2(x(0))} ${f2(y(0))}L${f2((x(0) + x(1)) / 2)} ${f2((y(0) + y(1)) / 2)}`;
  for (let i = 1; i < n - 1; i++) d += `Q${f2(x(i))} ${f2(y(i))} ${f2((x(i) + x(i + 1)) / 2)} ${f2((y(i) + y(i + 1)) / 2)}`;
  return `${d}L${f2(x(n - 1))} ${f2(y(n - 1))}`;
}

/**
 * Drop freehand points that add nothing (Ramer–Douglas–Peucker): a hand-drawn line of a thousand pointer events
 * becomes a few dozen points without visibly changing shape. `tolerance` is in points.
 */
export function simplifyPoints(points: readonly number[], tolerance = 0.4): number[] {
  const n = Math.floor(points.length / 2);
  if (n <= 2) return points.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = points[a * 2] as number;
    const ay = points[a * 2 + 1] as number;
    const bx = points[b * 2] as number;
    const by = points[b * 2 + 1] as number;
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1;
    let worst = tolerance;
    for (let i = a + 1; i < b; i++) {
      const px = points[i * 2] as number;
      const py = points[i * 2 + 1] as number;
      const dist = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (dist > worst) {
        worst = dist;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2] as number, points[i * 2 + 1] as number);
  return out;
}

/** Length of an arrow head for a line of this width. */
export const arrowLength = (strokeWidth: number) => Math.max(7, strokeWidth * 3.5);

/** The filled triangle at the (x2, y2) end of a line, as path data, and where the line itself should stop so its end does not poke through the tip. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, strokeWidth: number): { d: string; stopX: number; stopY: number } {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!(len > 0)) return { d: "", stopX: x2, stopY: y2 };
  const head = Math.min(arrowLength(strokeWidth), len);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const half = head * 0.45;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const d = `M${f2(x2)} ${f2(y2)}L${f2(bx - uy * half)} ${f2(by + ux * half)}L${f2(bx + uy * half)} ${f2(by - ux * half)}Z`;
  return { d, stopX: x2 - ux * head * 0.6, stopY: y2 - uy * head * 0.6 };
}

/** Path data for a mark in its square, and whether it is stroked (check, cross) or filled (dot). */
export function markPath(symbol: MarkSymbol, left: number, top: number, size: number): { d: string; stroke: number | null } {
  const p = (u: number, v: number) => `${f2(left + u * size)} ${f2(top + v * size)}`;
  if (symbol === "check") return { d: `M${p(0.12, 0.55)}L${p(0.4, 0.82)}L${p(0.9, 0.18)}`, stroke: size * 0.13 };
  if (symbol === "cross") return { d: `M${p(0.18, 0.18)}L${p(0.82, 0.82)}M${p(0.82, 0.18)}L${p(0.18, 0.82)}`, stroke: size * 0.13 };
  const r = size * 0.32;
  const cx = left + size / 2;
  const cy = top + size / 2;
  return { d: `M${f2(cx - r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(cx + r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(cx - r)} ${f2(cy)}Z`, stroke: null };
}

/** The rectangle an object covers on its page, for selection and checks. */
export function objectBounds(o: EditObject, measure?: Measure): { left: number; top: number; width: number; height: number } {
  switch (o.kind) {
    case "text":
      return { left: o.left, top: o.top, width: o.width, height: measure ? layoutText(o, measure).height : o.size * o.lineHeight };
    case "line": {
      const pad = o.strokeWidth / 2 + (o.arrow === "none" ? 0 : arrowLength(o.strokeWidth) * 0.45);
      return { left: Math.min(o.x1, o.x2) - pad, top: Math.min(o.y1, o.y2) - pad, width: Math.abs(o.x2 - o.x1) + pad * 2, height: Math.abs(o.y2 - o.y1) + pad * 2 };
    }
    case "ink": {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i + 1 < o.points.length; i += 2) {
        x0 = Math.min(x0, o.points[i] as number);
        x1 = Math.max(x1, o.points[i] as number);
        y0 = Math.min(y0, o.points[i + 1] as number);
        y1 = Math.max(y1, o.points[i + 1] as number);
      }
      if (!Number.isFinite(x0)) return { left: 0, top: 0, width: 0, height: 0 };
      const pad = o.strokeWidth / 2;
      return { left: x0 - pad, top: y0 - pad, width: x1 - x0 + pad * 2, height: y1 - y0 + pad * 2 };
    }
    case "mark":
      return { left: o.left, top: o.top, width: o.size, height: o.size };
    default:
      return { left: o.left, top: o.top, width: o.width, height: o.height };
  }
}

/* ----------------------------------------------------------------------------------------------- */
/* Reading the original text, for "Edit text"                                                       */
/* ----------------------------------------------------------------------------------------------- */

/** One piece of text as PDF.js reports it, with what is known about its font. */
export interface TextRunLike {
  str: string;
  transform: readonly number[];
  /** Advance width in unscaled page units. */
  width: number;
  /** Font ascent and descent as shares of the size (descent is negative), from PDF.js's text styles. */
  ascent?: number;
  descent?: number;
  /** "serif", "sans-serif", "monospace" or a font name. */
  fontFamily?: string;
  /** The font's own name, where known, such as "ABCDEF+TimesNewRomanPS-BoldMT". */
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
}

/** A line of the original text, in points on the page as shown. */
export interface PageTextLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  baseline: number;
  size: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}

/** Picks the nearest standard font for a font name or family. */
export function guessFont(name = "", family = ""): { family: FontFamily; bold: boolean; italic: boolean } {
  const both = `${name} ${family}`;
  const mono = /courier|mono|consol|menlo|inconsolata|typewriter|lucida ?console|\bcode\b/i.test(both);
  const familySerif = /\bserif\b/i.test(family) && !/sans/i.test(family);
  const serif = !mono && !/sans/i.test(name) && (familySerif || /times|georgia|garamond|cambria|antiqua|palatino|minion|baskerville|caslon|didot|bodoni|century|charter|libertine|roman|serif|book/i.test(name));
  return {
    family: mono ? "mono" : serif ? "serif" : "sans",
    bold: /bold|black|heavy|semibold|demi|,b\b/i.test(name),
    italic: /italic|oblique|,i\b|-it\b/i.test(name),
  };
}

/**
 * Join the pieces of text on a page into lines. `viewport` is PDF.js's transform at scale 1 for the page as shown.
 * Only text that reads left to right, level on the page as shown, is returned: turned or vertical text cannot be
 * replaced by a level line. Pieces join when they share a baseline and a size and the gap between them is less than
 * about a letter's width; a larger gap (a table column) starts a new line.
 */
export function groupTextLines(runs: readonly TextRunLike[], viewport: readonly number[]): PageTextLine[] {
  interface Open {
    parts: string[];
    left: number;
    right: number;
    baseline: number;
    size: number;
    ascent: number;
    descent: number;
    font: { family: FontFamily; bold: boolean; italic: boolean };
    longest: number;
  }
  const open: Open[] = [];
  for (const run of runs) {
    if (!run.str || !(run.width > 0)) continue;
    const t = multiplyMatrix(viewport, run.transform);
    const [a, b, c, d, e, f] = t as [number, number, number, number, number, number];
    const size = Math.abs(d);
    if (!(size > 0) || !(a > 0) || d >= 0 || Math.abs(b) > a * 0.02 || Math.abs(c) > size * 0.02) continue;
    const scale = Math.hypot(viewport[0] as number, viewport[1] as number) || 1;
    const width = run.width * scale;
    const left = e;
    const baseline = f;
    const str = run.str;
    let line: Open | undefined;
    for (let i = open.length - 1; i >= Math.max(0, open.length - 8); i--) {
      const o = open[i] as Open;
      const sameSize = size / o.size < 1.3 && o.size / size < 1.3;
      const gap = left - o.right;
      if (sameSize && Math.abs(baseline - o.baseline) <= Math.min(size, o.size) * 0.25 && gap >= -Math.min(size, o.size) * 0.5 && gap <= Math.max(size, o.size) * 1.2) {
        line = o;
        break;
      }
    }
    if (line) {
      const gap = left - line.right;
      const last = line.parts[line.parts.length - 1] ?? "";
      if (gap > Math.min(size, line.size) * 0.12 && !/\s$/.test(last) && !/^\s/.test(str)) line.parts.push(" ");
      line.parts.push(str);
      line.right = Math.max(line.right, left + width);
      line.left = Math.min(line.left, left);
      if (str.trim().length > line.longest) {
        line.longest = str.trim().length;
        line.size = size;
        line.font = guessFont(run.fontName, run.fontFamily);
        applyStyle(line.font, run);
      }
      line.ascent = Math.max(line.ascent, ascentOf(run));
      line.descent = Math.max(line.descent, descentOf(run));
    } else {
      if (str.trim() === "") continue;
      const font = guessFont(run.fontName, run.fontFamily);
      applyStyle(font, run);
      open.push({ parts: [str], left, right: left + width, baseline, size, ascent: ascentOf(run), descent: descentOf(run), font, longest: str.trim().length });
    }
  }
  return open
    .map((o) => {
      const text = o.parts.join("").replace(/\s+/g, " ").trim();
      const top = o.baseline - o.ascent * o.size;
      return { text, left: o.left, top, width: o.right - o.left, height: (o.ascent + o.descent) * o.size, baseline: o.baseline, size: o.size, ...o.font };
    })
    .filter((l) => l.text !== "")
    .sort((p, q) => p.top - q.top || p.left - q.left);
}

const ascentOf = (run: TextRunLike) => (run.ascent && run.ascent > 0.3 && run.ascent < 1.5 ? run.ascent : 0.85);
const descentOf = (run: TextRunLike) => (run.descent && run.descent < 0 && run.descent > -0.8 ? -run.descent : 0.22);
function applyStyle(font: { bold: boolean; italic: boolean }, run: TextRunLike) {
  if (run.bold) font.bold = true;
  if (run.italic) font.italic = true;
}

/**
 * The page colour behind a line of text and the colour of its letters, from the pixels of the page drawn as a picture
 * (RGBA, `width` × `height`). `rect` is in pixels. The background is the middle value of the pixels just around the
 * rectangle; the ink is the average of the pixels inside that differ from it most.
 */
export function sampleTextColors(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, rect: { left: number; top: number; width: number; height: number }): { background: Rgb; ink: Rgb } {
  const x0 = Math.max(0, Math.floor(rect.left));
  const y0 = Math.max(0, Math.floor(rect.top));
  const x1 = Math.min(width - 1, Math.ceil(rect.left + rect.width));
  const y1 = Math.min(height - 1, Math.ceil(rect.top + rect.height));
  const at = (x: number, y: number) => (y * width + x) * 4;
  const ring: number[][] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = at(x, y);
    ring.push([rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number]);
  };
  for (let x = x0 - 2; x <= x1 + 2; x++) {
    push(x, y0 - 2);
    push(x, y1 + 2);
  }
  for (let y = y0 - 2; y <= y1 + 2; y++) {
    push(x0 - 2, y);
    push(x1 + 2, y);
  }
  const median = (k: number) => {
    const v = ring.map((p) => p[k] as number).sort((p, q) => p - q);
    return v.length ? (v[Math.floor(v.length / 2)] as number) : 255;
  };
  const bg = [median(0), median(1), median(2)] as const;
  const inside: { d: number; p: [number, number, number] }[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = at(x, y);
      const p: [number, number, number] = [rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number];
      inside.push({ d: Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]), p });
    }
  }
  inside.sort((p, q) => q.d - p.d);
  const top = inside.slice(0, Math.max(1, Math.ceil(inside.length * 0.06)));
  const toRgb = (p: readonly number[]): Rgb => ({ r: (p[0] as number) / 255, g: (p[1] as number) / 255, b: (p[2] as number) / 255 });
  if (!top.length || (top[0] as { d: number }).d < 60) return { background: toRgb(bg), ink: { r: 0, g: 0, b: 0 } };
  const sum = top.reduce<[number, number, number]>((acc, { p }) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  return { background: toRgb(bg), ink: toRgb(sum.map((s) => s / top.length)) };
}

/* ----------------------------------------------------------------------------------------------- */
/* Saving                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

const snapTurn = (angle: number): 0 | 90 | 180 | 270 => ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;

/**
 * The matrix that maps the page as shown (x to the right, y up from the bottom edge as shown) onto the page's own
 * coordinates. Drawing inside it, a picture placed upright on screen is upright for the reader on a turned page.
 */
export function viewMatrix(g: PageGeometry): [number, number, number, number, number, number] {
  switch (g.rotate) {
    case 90:
      return [0, 1, -1, 0, g.x1, g.y0];
    case 180:
      return [-1, 0, 0, -1, g.x1, g.y1];
    case 270:
      return [0, -1, 1, 0, g.x0, g.y1];
    default:
      return [1, 0, 0, 1, g.x0, g.y0];
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1);
const color = (c: Rgb) => rgb(clamp01(c.r), clamp01(c.g), clamp01(c.b));
const finite = (...ns: number[]) => ns.every((n) => Number.isFinite(n));
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const KIND_NAMES: Record<EditKind, string> = {
  text: "text box",
  rect: "rectangle",
  ellipse: "ellipse",
  line: "line",
  ink: "drawing",
  highlight: "highlight",
  whiteout: "whiteout",
  image: "picture",
  mark: "mark",
};

export interface EditOptions {
  /** Supplies the font files for text the standard PDF fonts cannot print. */
  loadFont?: FontLoader;
}

/** Draw every object onto its page, in order (later objects on top), and save. Throws readable errors. */
export async function editPdf(bytes: Uint8Array, objects: readonly EditObject[], options: EditOptions = {}): Promise<Uint8Array> {
  if (objects.length === 0) throw new PdfError("Add something to a page first.");
  if (objects.length > EDIT_LIMITS.maxObjects) throw new PdfError(`There are ${objects.length} edits. At most ${EDIT_LIMITS.maxObjects} can be saved at once.`);
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const byPage = new Map<number, EditObject[]>();
  for (const o of objects) {
    if (!Number.isInteger(o.page) || !pages[o.page]) throw new PdfError(`Page ${o.page + 1} does not exist (this PDF has ${pages.length} pages).`);
    byPage.set(o.page, [...(byPage.get(o.page) ?? []), o]);
  }

  const images = new Map<Uint8Array, Promise<PDFImage>>();
  const embedImage = (data: Uint8Array) => {
    let made = images.get(data);
    if (!made) {
      made = (async () => {
        try {
          if (isPng(data)) return await doc.embedPng(data);
          if (isJpeg(data)) return await doc.embedJpg(data);
        } catch {
          // Reported below.
        }
        throw new PdfError("A picture could not be read. Add it again as a PNG or JPEG.");
      })();
      images.set(data, made);
    }
    return made;
  };

  for (const [index, list] of [...byPage].sort((a, b) => a[0] - b[0])) {
    const page = pages[index] as PDFPage;
    const box = page.getCropBox();
    const g: PageGeometry = { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height, rotate: snapTurn(page.getRotation().angle) };
    const H = displaySize(g).height;
    // pdf-lib wraps the page's own content in q/Q the first time it draws, so a page that leaves its graphics state changed cannot shift the edits.
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...viewMatrix(g)), setLineJoin(LineJoinStyle.Round));
    // Covers stand in for the original words they hide, so they go under every other edit on the page.
    for (const o of list) {
      const c = o.kind === "text" ? o.cover : undefined;
      if (c && finite(c.left, c.top, c.width, c.height) && c.width > 0 && c.height > 0) page.drawRectangle({ x: c.left, y: H - c.top - c.height, width: c.width, height: c.height, color: color(c.color), borderWidth: 0 });
    }
    for (const o of list) {
      const n = list.indexOf(o) + 1;
      await drawObject(doc, page, o, H, embedImage, options, `The ${KIND_NAMES[o.kind]} ${list.length > 1 ? `(${n} of ${list.length}) ` : ""}on page ${index + 1}`);
    }
    page.pushOperators(popGraphicsState());
  }
  return doc.save({ useObjectStreams: true });
}

async function drawObject(doc: PDFDocument, page: PDFPage, o: EditObject, H: number, embedImage: (data: Uint8Array) => Promise<PDFImage>, options: EditOptions, label: string): Promise<void> {
  const bad = () => new PdfError(`${label} has no valid position or size.`);
  // SVG path data is in points on the page as shown (y down); pdf-lib flips it about y = H.
  const svg = { x: 0, y: H };
  switch (o.kind) {
    case "whiteout":
    case "highlight":
    case "rect":
    case "ellipse":
    case "image": {
      if (!finite(o.left, o.top, o.width, o.height) || o.width <= 0 || o.height <= 0) throw bad();
      const x = o.left;
      const y = H - o.top - o.height;
      if (o.kind === "whiteout") page.drawRectangle({ x, y, width: o.width, height: o.height, color: color(o.color), borderWidth: 0 });
      else if (o.kind === "highlight") page.drawRectangle({ x, y, width: o.width, height: o.height, color: color(o.color), opacity: clamp01(o.opacity), blendMode: BlendMode.Multiply, borderWidth: 0 });
      else if (o.kind === "image") page.drawImage(await embedImage(o.image), { x, y, width: o.width, height: o.height, opacity: clamp01(o.opacity) });
      else {
        const strokeWidth = Math.min(EDIT_LIMITS.maxStrokeWidth, Math.max(0, o.strokeWidth));
        const stroke = o.stroke && strokeWidth > 0 ? color(o.stroke) : undefined;
        const fill = o.fill ? color(o.fill) : undefined;
        if (!stroke && !fill) return;
        const common = { color: fill, borderColor: stroke, borderWidth: stroke ? strokeWidth : 0, opacity: clamp01(o.opacity), borderOpacity: clamp01(o.opacity) };
        if (o.kind === "rect") page.drawRectangle({ x, y, width: o.width, height: o.height, ...common });
        else page.drawEllipse({ x: x + o.width / 2, y: y + o.height / 2, xScale: o.width / 2, yScale: o.height / 2, ...common });
      }
      return;
    }
    case "line": {
      if (!finite(o.x1, o.y1, o.x2, o.y2, o.strokeWidth) || o.strokeWidth <= 0) throw bad();
      const width = Math.min(EDIT_LIMITS.maxStrokeWidth, o.strokeWidth);
      let { x1, y1, x2, y2 } = o;
      const heads: string[] = [];
      if (o.arrow !== "none") {
        const end = arrowHead(x1, y1, x2, y2, width);
        heads.push(end.d);
        if (o.arrow === "both") {
          const start = arrowHead(x2, y2, x1, y1, width);
          heads.push(start.d);
          x1 = start.stopX;
          y1 = start.stopY;
        }
        x2 = end.stopX;
        y2 = end.stopY;
      }
      page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: width, color: color(o.color), opacity: clamp01(o.opacity), lineCap: LineCapStyle.Round });
      for (const d of heads) if (d) page.drawSvgPath(d, { ...svg, color: color(o.color), opacity: clamp01(o.opacity) });
      return;
    }
    case "ink": {
      if (o.points.length < 2 || o.points.length > EDIT_LIMITS.maxInkPoints * 2 || !finite(...o.points, o.strokeWidth) || o.strokeWidth <= 0) throw bad();
      page.drawSvgPath(inkPath(o.points), { ...svg, borderColor: color(o.color), borderWidth: Math.min(EDIT_LIMITS.maxStrokeWidth, o.strokeWidth), borderOpacity: clamp01(o.opacity), borderLineCap: LineCapStyle.Round });
      return;
    }
    case "mark": {
      if (!finite(o.left, o.top, o.size) || o.size <= 0) throw bad();
      const mark = markPath(o.symbol, o.left, o.top, o.size);
      if (mark.stroke) page.drawSvgPath(mark.d, { ...svg, borderColor: color(o.color), borderWidth: mark.stroke, borderOpacity: clamp01(o.opacity), borderLineCap: LineCapStyle.Round });
      else page.drawSvgPath(mark.d, { ...svg, color: color(o.color), opacity: clamp01(o.opacity) });
      return;
    }
    case "text": {
      if (!finite(o.left, o.top, o.width, o.size) || o.width <= 0) throw bad();
      if (o.size < EDIT_LIMITS.minFontSize || o.size > EDIT_LIMITS.maxFontSize) throw new PdfError(`${label} has a font size of ${o.size}. Use ${EDIT_LIMITS.minFontSize} to ${EDIT_LIMITS.maxFontSize} pt.`);
      if (o.text.length > EDIT_LIMITS.maxTextLength) throw new PdfError(`${label} is longer than ${EDIT_LIMITS.maxTextLength} characters.`);
      if (o.text.trim() === "") return;
      const flat = o.text.replace(/[\r\n\t]+/g, " ");
      const painter: TextPainter = await createTextPainter(doc, flat, { family: o.family, bold: o.bold, italic: o.italic, loadFont: options.loadFont, label });
      const layout = layoutText(o, (s) => painter.slice(s).width(1));
      for (const line of layout.lines) {
        if (line.text === "") continue;
        painter.slice(line.text).draw(page, { x: line.x, y: H - line.baseline, size: o.size, color: o.color, opacity: clamp01(o.opacity) });
        if (o.underline) {
          const y = H - line.baseline - o.size * UNDERLINE_OFFSET;
          page.drawLine({ start: { x: line.x, y }, end: { x: line.x + line.width, y }, thickness: o.size * UNDERLINE_THICKNESS, color: color(o.color), opacity: clamp01(o.opacity) });
        }
      }
      return;
    }
  }
}
