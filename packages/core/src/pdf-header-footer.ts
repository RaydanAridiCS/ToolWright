/**
 * Logic for the "Add Header and Footer to PDF" tool: up to six pieces of text on every page (left, middle and right of
 * the header and of the footer), with page numbers, a date, the file name and Bates numbers filled in per page.
 *
 * Bates numbering is the running identifier lawyers stamp on every page of a document set, such as "ACME-000123".
 * Keep this file free of React, the DOM and the network.
 */
import { PDFDocument } from "pdf-lib";
import { displayToPageSpace, loadPdf, pageViewOf, PdfError } from "./pdf";
import { pagesFromSpec } from "./pdf-sign";
import { createTextPainter, type FontLoader, type TextPainter } from "./pdf-text";

export const ZONES = ["header-left", "header-center", "header-right", "footer-left", "footer-center", "footer-right"] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  "header-left": "Header, left",
  "header-center": "Header, middle",
  "header-right": "Header, right",
  "footer-left": "Footer, left",
  "footer-center": "Footer, middle",
  "footer-right": "Footer, right",
};

export const HEADER_FOOTER_LIMITS = {
  maxTextLength: 200,
  minSize: 4,
  maxSize: 72,
  maxMargin: 200,
  maxBatesDigits: 12,
  maxAffix: 30,
} as const;

/** The pieces that are replaced on every page. */
export const TOKENS = [
  { token: "{page}", label: "Page number", example: "3" },
  { token: "{pages}", label: "Page count", example: "12" },
  { token: "{bates}", label: "Bates number", example: "ACME-000003" },
  { token: "{date}", label: "Date", example: "2026-03-15" },
  { token: "{file}", label: "File name", example: "contract" },
] as const;

export interface BatesOptions {
  prefix: string;
  /** The number on the first stamped page. */
  start: number;
  /** Pad with zeros to this many digits. */
  digits: number;
  suffix: string;
}

export interface HeaderFooterOptions {
  /** Text for each zone; an empty or missing zone prints nothing. */
  zones: Partial<Record<Zone, string>>;
  fontSize?: number;
  /** Distance from the page edge to the text, in points. */
  margin?: number;
  color?: { r: number; g: number; b: number };
  /** What {page} shows on the first page of the document. Default 1. */
  startAt?: number;
  bates?: BatesOptions;
  /** Zero-based pages to stamp; every page when missing. */
  pages?: readonly number[];
  /** Swap left and right on even pages, so outer or inner edges match when printed double-sided. */
  mirror?: boolean;
  /** Shown for {date}. Pass it in, so the result is the same however often it runs. */
  date?: string;
  /** Shown for {file}, without the extension. */
  fileName?: string;
  loadFont?: FontLoader;
}

export const DEFAULT_BATES: BatesOptions = { prefix: "", start: 1, digits: 6, suffix: "" };

/** "ACME-" + 123 with 6 digits + "" gives "ACME-000123". Numbers longer than the padding are not cut. */
export function formatBates(bates: BatesOptions, number: number): string {
  return `${bates.prefix}${String(number).padStart(bates.digits, "0")}${bates.suffix}`;
}

export function checkBates(bates: BatesOptions): void {
  const { maxAffix, maxBatesDigits } = HEADER_FOOTER_LIMITS;
  if (!Number.isInteger(bates.start) || bates.start < 0) throw new PdfError("The Bates starting number must be a whole number, 0 or more.");
  if (!Number.isInteger(bates.digits) || bates.digits < 1 || bates.digits > maxBatesDigits) throw new PdfError(`Bates numbers need 1 to ${maxBatesDigits} digits.`);
  if (bates.prefix.length > maxAffix || bates.suffix.length > maxAffix) throw new PdfError(`The Bates prefix and suffix can be at most ${maxAffix} characters each.`);
}

export interface PageContext {
  /** Zero-based position in the document. */
  index: number;
  pageCount: number;
  startAt: number;
  /** How many pages were stamped before this one. */
  stampedBefore: number;
  bates?: BatesOptions;
  date: string;
  fileName: string;
}

/** Replace {page}, {pages}, {bates}, {date} and {file} in `template`. Anything else in braces is printed as typed. */
export function expandTokens(template: string, ctx: PageContext): string {
  return template.replace(/\{(page|pages|bates|date|file)\}/gi, (_, name: string) => {
    switch (name.toLowerCase()) {
      case "page":
        return String(ctx.startAt + ctx.index);
      case "pages":
        return String(ctx.pageCount + ctx.startAt - 1);
      case "bates":
        return ctx.bates ? formatBates(ctx.bates, ctx.bates.start + ctx.stampedBefore) : "";
      case "date":
        return ctx.date;
      default:
        return ctx.fileName;
    }
  });
}

export const usesBates = (zones: Partial<Record<Zone, string>>) => Object.values(zones).some((t) => /\{bates\}/i.test(t ?? ""));

/** The zones that print on `index`, with left and right swapped on even pages (2, 4, …) when `mirror` is on. */
export function zonesForPage(zones: Partial<Record<Zone, string>>, index: number, mirror: boolean): Partial<Record<Zone, string>> {
  if (!mirror || index % 2 === 0) return zones;
  return {
    "header-left": zones["header-right"],
    "header-right": zones["header-left"],
    "footer-left": zones["footer-right"],
    "footer-right": zones["footer-left"],
    "header-center": zones["header-center"],
    "footer-center": zones["footer-center"],
  };
}

const GAP = 8;

/**
 * Where the pieces of one row start, and an error message if they run into each other or off the page.
 * `widths` holds the width of each piece that has text.
 */
export function layoutRow(pageWidth: number, margin: number, widths: { left?: number; center?: number; right?: number }): { left?: number; center?: number; right?: number; problem?: string } {
  const { left, center, right } = widths;
  const at = {
    left: left === undefined ? undefined : margin,
    center: center === undefined ? undefined : (pageWidth - center) / 2,
    right: right === undefined ? undefined : pageWidth - margin - right,
  };
  const spans = ([
    ["left", at.left, left],
    ["middle", at.center, center],
    ["right", at.right, right],
  ] as const).flatMap(([name, x, w]) => (x === undefined || w === undefined ? [] : [{ name, x, end: x + w }]));
  for (const s of spans) if (s.x < 0 || s.end > pageWidth) return { ...at, problem: `the ${s.name} text is wider than the page` };
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1] as (typeof spans)[number];
    const b = spans[i] as (typeof spans)[number];
    if (a.end + GAP > b.x) return { ...at, problem: `the ${a.name} and ${b.name} text run into each other` };
  }
  return at;
}

/** Stamp the header and footer text on the chosen pages. Throws readable errors. */
export async function addHeaderFooter(bytes: Uint8Array, options: HeaderFooterOptions): Promise<Uint8Array> {
  const { zones, fontSize = 10, margin = 36, color = { r: 0.2, g: 0.2, b: 0.2 }, startAt = 1, mirror = false, loadFont } = options;
  const { maxTextLength, minSize, maxSize, maxMargin } = HEADER_FOOTER_LIMITS;
  const bates = options.bates ?? DEFAULT_BATES;
  const filled = ZONES.filter((z) => (zones[z] ?? "").trim() !== "");
  if (filled.length === 0) throw new PdfError("Type text in at least one of the six boxes.");
  for (const z of filled) if ((zones[z] as string).length > maxTextLength) throw new PdfError(`${ZONE_LABELS[z]} is longer than ${maxTextLength} characters.`);
  if (!(fontSize >= minSize && fontSize <= maxSize)) throw new PdfError(`Text size must be between ${minSize} and ${maxSize} points.`);
  if (!(margin >= 0 && margin <= maxMargin)) throw new PdfError(`The margin must be between 0 and ${maxMargin} points.`);
  if (!Number.isInteger(startAt)) throw new PdfError("The starting page number must be a whole number.");
  if (usesBates(zones)) checkBates(bates);

  const doc = await loadPdf(bytes);
  const count = doc.getPageCount();
  const chosen = options.pages ? [...new Set(options.pages)].sort((a, b) => a - b) : Array.from({ length: count }, (_, i) => i);
  if (chosen.length === 0) throw new PdfError("No pages are selected.");
  const bad = chosen.find((p) => !Number.isInteger(p) || p < 0 || p >= count);
  if (bad !== undefined) throw new PdfError(`Page ${bad + 1} does not exist (this PDF has ${count} pages).`);

  const pages = doc.getPages();
  const painters = new Map<string, TextPainter>();
  const painterFor = async (text: string, label: string, pageNumber: number) => {
    let p = painters.get(text);
    if (!p) {
      p = await createTextPainter(doc, text, { loadFont, label: `${label} on page ${pageNumber}` });
      // A page-specific text is drawn once, so keep only the few that repeat (a date, a file name).
      if (painters.size < 50) painters.set(text, p);
    }
    return p;
  };

  for (const [stampedBefore, index] of chosen.entries()) {
    const page = pages[index] as ReturnType<PDFDocument["getPages"]>[number];
    const ctx: PageContext = { index, pageCount: count, startAt, stampedBefore, bates, date: options.date ?? "", fileName: options.fileName ?? "" };
    const here = zonesForPage(zones, index, mirror);
    const { box, rotation, view } = pageViewOf(page);

    const rows: { name: "header" | "footer"; baseline: number }[] = [
      { name: "header", baseline: view.height - margin - fontSize * 0.75 },
      { name: "footer", baseline: margin + fontSize * 0.25 },
    ];
    for (const row of rows) {
      const parts = (["left", "center", "right"] as const).flatMap((side) => {
        const zone = `${row.name}-${side}` as Zone;
        const text = expandTokens(here[zone] ?? "", ctx).trim();
        return text === "" ? [] : [{ side, zone, text }];
      });
      if (parts.length === 0) continue;
      const drawn = await Promise.all(parts.map(async (p) => ({ ...p, painter: await painterFor(p.text, ZONE_LABELS[p.zone], index + 1) })));
      const widths: { left?: number; center?: number; right?: number } = {};
      for (const d of drawn) widths[d.side] = d.painter.width(fontSize);
      const layout = layoutRow(view.width, margin, widths);
      if (layout.problem) throw new PdfError(`On page ${index + 1}, the ${row.name}: ${layout.problem}. Shorten the text, use a smaller size or a smaller margin.`);
      for (const d of drawn) {
        const dx = layout[d.side] as number;
        const at = displayToPageSpace(box, rotation, dx, row.baseline);
        d.painter.draw(page, { x: at.x, y: at.y, size: fontSize, color, rotate: at.rotate });
      }
    }
  }
  return doc.save({ useObjectStreams: true });
}

export type PageChoice = "all" | "odd" | "even" | "custom";

/** Zero-based pages to stamp: every page, the odd or even ones (counting from 1), or a list such as "2-5, 8"; optionally without the first page. */
export function choosePages(choice: PageChoice, spec: string, pageCount: number, skipFirst: boolean): number[] {
  let pages: number[];
  if (choice === "custom") pages = pagesFromSpec(spec, pageCount);
  else pages = Array.from({ length: pageCount }, (_, i) => i).filter((i) => choice === "all" || (choice === "odd" ? i % 2 === 0 : i % 2 === 1));
  if (skipFirst) pages = pages.filter((i) => i !== 0);
  if (pages.length === 0) throw new PdfError("No pages are selected.");
  return pages;
}
