/**
 * Print text onto PDF pages in more than the 200 or so characters the standard PDF fonts hold.
 *
 * Text that the standard font can print (English and most Western European text) keeps using it: nothing is
 * loaded and the file stays small. Anything else (Polish, Czech, Turkish, Vietnamese, Russian, Greek…) is printed
 * with Noto Sans, one small single-script file per script used. The font files are fetched by the
 * caller (`FontLoader`), so this file stays free of the DOM and the network.
 *
 * Not covered: Arabic, Hebrew, Indic scripts, Chinese, Japanese and Korean. They need letter shaping or fonts of
 * several megabytes; text in them is refused with a message that says so.
 */
import { degrees, rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { PdfError } from "./pdf";

/** Font subsets, in the order they are tried. Each covers one script; a text may mix several. */
export const FONT_SUBSETS = ["latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "greek-ext"] as const;
export type FontSubset = (typeof FONT_SUBSETS)[number];
export type FontWeight = 400 | 700;

/** File name of a subset, as copied to the site by scripts/copy-font-assets.mjs. */
export const fontFileName = (subset: FontSubset, weight: FontWeight) => `noto-sans-${subset}-${weight}-normal.woff2`;

/** Returns the bytes of one font file. The browser version fetches it from this site. */
export type FontLoader = (subset: FontSubset, weight: FontWeight) => Promise<Uint8Array>;

export interface DrawOptions {
  x: number;
  y: number;
  size: number;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  /** Counter-clockwise degrees about (x, y). */
  rotate?: number;
}

export interface TextPainter {
  /** Width of the whole text in points at this size. */
  width(size: number): number;
  draw(page: PDFPage, options: DrawOptions): void;
}

interface Run {
  font: PDFFont;
  text: string;
}

/** One embedded copy of each font per document, however many texts and pages use it. */
const embedded = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();
function once(doc: PDFDocument, key: string, make: () => Promise<PDFFont>): Promise<PDFFont> {
  let fonts = embedded.get(doc);
  if (!fonts) embedded.set(doc, (fonts = new Map()));
  let font = fonts.get(key);
  if (!font) fonts.set(key, (font = make()));
  return font;
}

/** The standard Helvetica (or bold) of this document, embedded once. */
export const standardFont = (doc: PDFDocument, bold = false) => once(doc, bold ? "std-bold" : "std", () => doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica));

const NOT_PRINTABLE = "Use English or European letters (Latin, Cyrillic or Greek), digits and punctuation.";

function describe(chars: string[]): string {
  const shown = chars.slice(0, 4).join(" ");
  return chars.length > 4 ? `${shown} and ${chars.length - 4} more` : shown;
}

/**
 * Prepare `text` for drawing on pages of `doc`. Throws a PdfError that names the characters when they cannot be printed.
 * Call once per distinct text, then `draw` on as many pages as needed.
 */
export async function createTextPainter(doc: PDFDocument, text: string, options: { bold?: boolean; loadFont?: FontLoader; /** How error messages refer to the text, such as "The caption". */ label?: string } = {}): Promise<TextPainter> {
  const { bold = false, loadFont } = options;
  const subject = options.label ?? `“${text.slice(0, 30)}”`;
  const standard = await standardFont(doc, bold);
  let runs: Run[];
  try {
    standard.encodeText(text);
    runs = [{ font: standard, text }];
  } catch {
    if (!loadFont) throw new PdfError(`${subject} has characters the standard PDF font cannot print. ${NOT_PRINTABLE}`);
    runs = await unicodeRuns(doc, text, bold ? 700 : 400, loadFont, subject);
  }

  const widthOf = (size: number) => runs.reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  return {
    width: widthOf,
    draw(page, { x, y, size, color = { r: 0, g: 0, b: 0 }, opacity, rotate = 0 }) {
      const rad = (rotate * Math.PI) / 180;
      let offset = 0;
      for (const run of runs) {
        page.drawText(run.text, {
          x: x + Math.cos(rad) * offset,
          y: y + Math.sin(rad) * offset,
          size,
          font: run.font,
          color: rgb(color.r, color.g, color.b),
          opacity,
          rotate: degrees(rotate),
        });
        offset += run.font.widthOfTextAtSize(run.text, size);
      }
    },
  };
}

/** Can this text be printed at all, with the standard font or Noto Sans? Loads the fonts it needs. */
export async function checkPrintable(text: string, loadFont: FontLoader): Promise<void> {
  const { PDFDocument } = await import("pdf-lib");
  await createTextPainter(await PDFDocument.create(), text, { loadFont });
}

async function unicodeRuns(doc: PDFDocument, text: string, weight: FontWeight, loadFont: FontLoader, subject: string): Promise<Run[]> {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  doc.registerFontkit(fontkit);

  // A tab or line break would print as a missing-glyph box; a single space reads better and keeps the line on one row.
  const clean = text.replace(/[\t\r\n\u00a0]+/g, " ");
  const loaded = new Map<FontSubset, { bytes: Uint8Array; covers(cp: number): boolean }>();
  const load = async (subset: FontSubset) => {
    let entry = loaded.get(subset);
    if (!entry) {
      let bytes: Uint8Array;
      try {
        bytes = await loadFont(subset, weight);
      } catch {
        throw new PdfError("The font for this text could not be loaded. Check your connection once, then it works offline.");
      }
      const parsed = fontkit.create(bytes);
      entry = { bytes, covers: (cp) => parsed.hasGlyphForCodePoint(cp) };
      loaded.set(subset, entry);
    }
    return entry;
  };

  // Pick, per character, the first subset that has it. Later subsets are only loaded when an earlier one falls short.
  const chosen: (FontSubset | null)[] = [];
  const missing: string[] = [];
  for (const ch of clean) {
    const cp = ch.codePointAt(0) as number;
    let pick: FontSubset | null = null;
    for (const subset of FONT_SUBSETS) {
      if ((await load(subset)).covers(cp)) {
        pick = subset;
        break;
      }
    }
    if (!pick && !missing.includes(ch)) missing.push(ch);
    chosen.push(pick);
  }
  if (missing.length > 0) throw new PdfError(`${subject} has characters that cannot be printed: ${describe(missing)}. ${NOT_PRINTABLE}`);

  const runs: Run[] = [];
  let i = 0;
  for (const ch of clean) {
    const subset = chosen[i++] as FontSubset;
    // Whole files, not subsets: fontkit's subsetter throws inside a timer on these files (an uncaught error that
    // cannot be handled), and each file is already a single script of 5 to 60 KB. `ccmp` off keeps a letter such as
    // "ẹ" as the font's own glyph instead of a letter plus a separately placed mark, which pdf-lib would not position.
    const font = await once(doc, `${subset}-${weight}`, async () => doc.embedFont((await load(subset)).bytes, { subset: false, features: { ccmp: false } }));
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ font, text: ch });
  }
  return runs;
}
