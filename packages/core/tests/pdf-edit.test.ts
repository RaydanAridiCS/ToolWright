import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees, StandardFonts } from "pdf-lib";
import { scanContent } from "../src/pdf-compress";
import {
  arrowHead,
  createStandardMeasurer,
  editPdf,
  groupTextLines,
  guessFont,
  inkPath,
  layoutText,
  markPath,
  objectBounds,
  sampleTextColors,
  simplifyPoints,
  topForBaseline,
  viewMatrix,
  wrapText,
  TEXT_ASCENT,
  type EditObject,
  type TextEdit,
  type TextRunLike,
} from "../src/pdf-edit";
import { displayToUser, userToDisplay, type PageGeometry } from "../src/pdf-sign";
import { multiplyMatrix } from "../src/redact-pdf";
import { fontsFromDisk } from "./pdf-read-back";

/** Every character is 1 unit wide, so widths are easy to reason about. */
const mono = (s: string) => Array.from(s).length;

const BLACK = { r: 0, g: 0, b: 0 };

const text = (patch: Partial<TextEdit> = {}): TextEdit => ({
  kind: "text",
  page: 0,
  left: 72,
  top: 100,
  width: 300,
  text: "Hello",
  size: 12,
  family: "sans",
  bold: false,
  italic: false,
  underline: false,
  color: BLACK,
  align: "left",
  lineHeight: 1.2,
  opacity: 1,
  ...patch,
});

async function makePdf(turns: (0 | 90 | 180 | 270)[], size: [number, number] = [612, 792], crop?: [number, number, number, number]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const turn of turns) {
    const page = doc.addPage(size);
    page.setRotation(degrees(turn));
    if (crop) page.setCropBox(...crop);
  }
  return doc.save();
}

/** A real PNG (RGBA, all one colour) built with node's zlib. */
function makePng(width: number, height: number, rgba = [200, 30, 30, 255]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(rgba, y * (width * 4 + 1) + 1 + x * 4);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

interface ShownItem {
  str: string;
  /** Start of the baseline on the page as shown, in points from the top left. */
  x: number;
  y: number;
  size: number;
  /** True when the text runs left to right on the page as shown. */
  level: boolean;
  font: string;
}

/** The text PDF.js finds on a page, placed on the page as a reader sees it (after the page's own turn). */
async function shownItems(bytes: Uint8Array, pageNumber = 1): Promise<ShownItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const out = content.items.flatMap((item) => {
    if (!("str" in item) || item.str === "") return [];
    const t = multiplyMatrix(viewport.transform, item.transform);
    return [{ str: item.str, x: t[4] as number, y: t[5] as number, size: Math.abs(t[3] as number) || Math.abs(t[2] as number), level: (t[0] as number) > 0 && Math.abs(t[1] as number) < 1e-6, font: content.styles[item.fontName]?.fontFamily ?? "" }];
  });
  await task.destroy();
  return out;
}

/** The names of the fonts a page uses. */
async function fontNames(bytes: Uint8Array, pageIndex = 0): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const fonts = doc.getPage(pageIndex).node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
  if (!fonts) return [];
  return fonts.keys().map((key) => {
    const font = fonts.lookup(key, PDFDict);
    return String(font.get(PDFName.of("BaseFont")));
  });
}

/** Everything drawn on a page, as content-stream text. */
async function contentOf(bytes: Uint8Array, pageIndex = 0): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(pageIndex).node.Contents();
  const streams = contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_, i) => doc.context.lookup(contents.get(i))) : [contents];
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
}

describe("wrapText", () => {
  it("keeps short text on one line and starts a line at every line break", () => {
    expect(wrapText("Hello", 10, mono)).toEqual(["Hello"]);
    expect(wrapText("one\ntwo\r\nthree", 10, mono)).toEqual(["one", "two", "three"]);
    expect(wrapText("", 10, mono)).toEqual([""]);
    expect(wrapText("a\n\nb", 10, mono)).toEqual(["a", "", "b"]);
  });

  it("breaks between words and drops the spaces where a line wraps", () => {
    expect(wrapText("the quick brown fox", 10, mono)).toEqual(["the quick", "brown fox"]);
    expect(wrapText("aaaa bbbb    cccc", 9, mono)).toEqual(["aaaa bbbb", "cccc"]);
  });

  it("breaks a word longer than the whole line between letters", () => {
    expect(wrapText("abcdefghijkl", 5, mono)).toEqual(["abcde", "fghij", "kl"]);
    expect(wrapText("hi abcdefghij", 5, mono)).toEqual(["hi", "abcde", "fghij"]);
  });

  it("keeps an indent at the start of a paragraph and turns tabs into spaces", () => {
    expect(wrapText("  indented", 20, mono)).toEqual(["  indented"]);
    expect(wrapText("\tx", 20, mono)).toEqual(["    x"]);
  });

  it("never loops on a width too small for one letter", () => {
    expect(wrapText("abc", 0, mono)).toEqual(["a", "b", "c"]);
  });

  it("does not wrap at all with an unlimited width", () => {
    expect(wrapText("a very long line of text indeed", Infinity, mono)).toEqual(["a very long line of text indeed"]);
  });
});

describe("layoutText", () => {
  it("puts baselines a line height apart, the first TEXT_ASCENT below the top plus half the extra leading", () => {
    const layout = layoutText({ text: "ab\ncd", left: 10, top: 20, width: 100, size: 10, align: "left", lineHeight: 1.5 }, mono);
    expect(layout.lines.map((l) => l.baseline)).toEqual([20 + 10 * (0.25 + TEXT_ASCENT), 20 + 10 * (0.25 + TEXT_ASCENT + 1.5)]);
    expect(layout.height).toBe(30);
    expect(topForBaseline(layout.lines[0]!.baseline, 10, 1.5)).toBeCloseTo(20, 9);
  });

  it("aligns each line inside the box", () => {
    const base = { text: "ab\nabcd", left: 10, top: 0, width: 100, size: 10, lineHeight: 1.2 };
    expect(layoutText({ ...base, align: "left" }, mono).lines.map((l) => l.x)).toEqual([10, 10]);
    expect(layoutText({ ...base, align: "center" }, mono).lines.map((l) => l.x)).toEqual([50, 40]);
    expect(layoutText({ ...base, align: "right" }, mono).lines.map((l) => l.x)).toEqual([90, 70]);
  });

  it("wraps at the box width at the font size", () => {
    expect(layoutText({ text: "aaaa bbbb", left: 0, top: 0, width: 60, size: 10, align: "left", lineHeight: 1.2 }, mono).lines.map((l) => l.text)).toEqual(["aaaa", "bbbb"]);
  });
});

describe("the standard font measurer", () => {
  it("measures exactly as pdf-lib's standard fonts do, and returns null for text they cannot print", async () => {
    const measure = await createStandardMeasurer();
    const doc = await PDFDocument.create();
    const times = await doc.embedFont(StandardFonts.TimesRomanBold);
    expect(measure("Wavy text", "serif", true, false)).toBeCloseTo(times.widthOfTextAtSize("Wavy text", 1), 9);
    expect(measure("iiii", "mono", false, false)).toBeCloseTo(2.4, 9);
    expect(measure("iiii", "sans", false, false)).toBeLessThan(measure("WWWW", "sans", false, false)!);
    expect(measure("Łódź", "sans", false, false)).toBeNull();
  });
});

describe("path helpers", () => {
  it("draws freehand points as a smooth path through the midpoints", () => {
    expect(inkPath([])).toBe("");
    expect(inkPath([1, 2])).toBe("M1 2L1 2");
    expect(inkPath([0, 0, 10, 0])).toBe("M0 0L10 0");
    expect(inkPath([0, 0, 10, 0, 10, 10])).toBe("M0 0L5 0Q10 0 10 5L10 10");
  });

  it("simplifies a straight run of points to its two ends and keeps corners", () => {
    const straight = Array.from({ length: 50 }, (_, i) => [i, i * 2]).flat();
    expect(simplifyPoints(straight)).toEqual([0, 0, 49, 98]);
    const corner = [0, 0, 5, 0, 10, 0, 10, 5, 10, 10];
    expect(simplifyPoints(corner)).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it("puts an arrow head at the end of a line, with the line stopping inside it", () => {
    const head = arrowHead(0, 0, 100, 0, 2);
    expect(head.d.startsWith("M100 0L")).toBe(true);
    expect(head.stopX).toBeLessThan(100);
    expect(head.stopX).toBeGreaterThan(90);
    expect(head.stopY).toBe(0);
    expect(arrowHead(5, 5, 5, 5, 2).d).toBe("");
  });

  it("draws marks inside their square", () => {
    const check = markPath("check", 10, 20, 100);
    expect(check.stroke).toBeCloseTo(13, 9);
    expect(check.d).toBe("M22 75L50 102L100 38");
    expect(markPath("dot", 0, 0, 10).stroke).toBeNull();
  });

  it("gives the bounds of lines and drawings, including the stroke", () => {
    expect(objectBounds({ kind: "line", page: 0, x1: 10, y1: 10, x2: 50, y2: 20, color: BLACK, strokeWidth: 2, opacity: 1, arrow: "none" })).toEqual({ left: 9, top: 9, width: 42, height: 12 });
    expect(objectBounds({ kind: "ink", page: 0, points: [5, 5, 15, 25], color: BLACK, strokeWidth: 4, opacity: 1 })).toEqual({ left: 3, top: 3, width: 14, height: 24 });
  });
});

describe("guessFont", () => {
  it.each([
    ["ABCDEF+TimesNewRomanPS-BoldItalicMT", "", { family: "serif", bold: true, italic: true }],
    ["Times-Roman", "", { family: "serif", bold: false, italic: false }],
    ["Georgia", "", { family: "serif", bold: false, italic: false }],
    ["XYZ+Calibri-Bold", "sans-serif", { family: "sans", bold: true, italic: false }],
    ["Arial,Italic", "", { family: "sans", bold: false, italic: true }],
    ["CourierNewPSMT", "", { family: "mono", bold: false, italic: false }],
    ["", "monospace", { family: "mono", bold: false, italic: false }],
    ["", "serif", { family: "serif", bold: false, italic: false }],
    ["NotoSans-Regular", "serif", { family: "sans", bold: false, italic: false }],
  ])("%s / %s", (name, family, expected) => {
    expect(guessFont(name, family)).toEqual(expected);
  });
});

describe("groupTextLines", () => {
  // A page 600 × 800 shown upright: PDF.js's viewport flips y.
  const viewport = [1, 0, 0, -1, 0, 800];
  const run = (str: string, x: number, baseline: number, width: number, size = 12, extra: Partial<TextRunLike> = {}): TextRunLike => ({ str, transform: [size, 0, 0, size, x, 800 - baseline], width, ascent: 0.9, descent: -0.2, fontFamily: "sans-serif", ...extra });

  it("joins the pieces of one line, adding a space where there is a gap", () => {
    const lines = groupTextLines([run("Hello", 72, 100, 30), run("world", 106, 100, 32), run("!", 138, 100, 3)], viewport);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ text: "Hello world!", left: 72, width: 69, baseline: 100, size: 12, family: "sans" });
    expect(lines[0]!.top).toBeCloseTo(100 - 0.9 * 12, 9);
    expect(lines[0]!.height).toBeCloseTo(1.1 * 12, 9);
  });

  it("keeps lines, table columns and differently sized text apart, sorted top to bottom", () => {
    const lines = groupTextLines([run("Second", 72, 130, 40), run("First", 72, 100, 30), run("Price", 400, 100, 30), run("Big", 72, 160, 60, 30)], viewport);
    expect(lines.map((l) => l.text)).toEqual(["First", "Price", "Second", "Big"]);
  });

  it("takes the font of the longest piece and notices bold and italic", () => {
    const lines = groupTextLines([run("A", 72, 100, 8, 12, { fontName: "Helvetica" }), run(" heading in serif", 80, 100, 90, 12, { fontName: "ABC+Times-Bold", fontFamily: "serif" })], viewport);
    expect(lines[0]).toMatchObject({ text: "A heading in serif", family: "serif", bold: true, italic: false });
    expect(groupTextLines([run("x", 72, 100, 8, 12, { italic: true })], viewport)[0]!.italic).toBe(true);
  });

  it("leaves out turned text and blank pieces", () => {
    const turned: TextRunLike = { str: "Sideways", transform: [0, 12, -12, 0, 300, 300], width: 50 };
    expect(groupTextLines([turned, run("   ", 72, 100, 10)], viewport)).toEqual([]);
  });

  it("works on a page stored turned, where the viewport turns the text level", () => {
    // A page 600 × 800 turned 90°: shown 800 wide and 600 tall. Text drawn running up the page reads level.
    const turnedViewport = [0, 1, 1, 0, 0, 0];
    const lines = groupTextLines([{ str: "Level", transform: [0, 12, -12, 0, 100, 72], width: 30 }], turnedViewport);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ text: "Level", left: 72, baseline: 100 });
  });
});

describe("sampleTextColors", () => {
  it("finds the page colour around a word and the colour of its letters", () => {
    const w = 40;
    const h = 20;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([250, 245, 230, 255], i * 4);
    // A blue word inside x 10..30, y 5..15.
    for (let y = 7; y < 13; y++) for (let x = 12; x < 28; x += 2) px.set([20, 40, 160, 255], (y * w + x) * 4);
    const { background, ink } = sampleTextColors(px, w, h, { left: 10, top: 5, width: 20, height: 10 });
    expect(background).toEqual({ r: 250 / 255, g: 245 / 255, b: 230 / 255 });
    expect(ink.b).toBeCloseTo(160 / 255, 5);
    expect(ink.r).toBeCloseTo(20 / 255, 5);
  });

  it("falls back to black ink on an area with no letters", () => {
    const px = new Uint8ClampedArray(10 * 10 * 4).fill(255);
    expect(sampleTextColors(px, 10, 10, { left: 2, top: 2, width: 5, height: 5 }).ink).toEqual(BLACK);
  });
});

describe("viewMatrix", () => {
  it.each([0, 90, 180, 270] as const)("maps the page as shown onto the page's own space for a %i° page", (rotate) => {
    const g: PageGeometry = { x0: 10, y0: 20, x1: 610, y1: 820, rotate };
    const [a, b, c, d, e, f] = viewMatrix(g);
    const H = rotate === 90 || rotate === 270 ? 600 : 800;
    for (const [u, v] of [
      [0, 0],
      [100, 50],
      [37, 412],
    ] as const) {
      const w = H - v;
      const want = displayToUser(g, u, v);
      expect(a * u + c * w + e).toBeCloseTo(want.x, 9);
      expect(b * u + d * w + f).toBeCloseTo(want.y, 9);
    }
  });
});

describe("editPdf", () => {
  it.each([0, 90, 180, 270] as const)("puts text where it was placed, reading level, on a page turned %i°", async (turn) => {
    const bytes = await makePdf([turn]);
    const out = await editPdf(bytes, [text({ left: 72, top: 100, text: "Placed here", size: 20 })]);
    const items = await shownItems(out);
    expect(items).toHaveLength(1);
    const [item] = items as [ShownItem];
    expect(item.str).toBe("Placed here");
    expect(item.level).toBe(true);
    expect(item.size).toBeCloseTo(20, 5);
    expect(item.x).toBeCloseTo(72, 3);
    expect(item.y).toBeCloseTo(100 + 20 * (0.1 + TEXT_ASCENT), 3);
  });

  it("respects a crop box that does not start at the origin", async () => {
    const bytes = await makePdf([90], [612, 792], [50, 60, 400, 500]);
    const out = await editPdf(bytes, [text({ left: 30, top: 40, text: "In the crop" })]);
    const [item] = (await shownItems(out)) as [ShownItem];
    expect(item.x).toBeCloseTo(30, 3);
    expect(item.y).toBeCloseTo(40 + 12 * (0.1 + TEXT_ASCENT), 3);
  });

  it("wraps a long text box and aligns its lines, exactly as the layout says", async () => {
    const measure = await createStandardMeasurer();
    const t = text({ text: "The quick brown fox jumps over the lazy dog\nSecond paragraph", width: 150, align: "right", size: 14 });
    const layout = layoutText(t, (s) => measure(s, "sans", false, false) as number);
    expect(layout.lines.length).toBeGreaterThanOrEqual(3);
    const items = await shownItems(await editPdf(await makePdf([0]), [t]));
    expect(items.map((i) => i.str)).toEqual(layout.lines.map((l) => l.text));
    items.forEach((item, i) => {
      expect(item.x).toBeCloseTo(layout.lines[i]!.x, 3);
      expect(item.y).toBeCloseTo(layout.lines[i]!.baseline, 3);
    });
  });

  it("uses Times and Courier, bold and italic, from the standard fonts", async () => {
    const out = await editPdf(await makePdf([0]), [text({ family: "serif", bold: true, italic: true, text: "Serif" }), text({ family: "mono", top: 200, text: "Mono" })]);
    const names = await fontNames(out);
    expect(names).toContain("/Times-BoldItalic");
    expect(names).toContain("/Courier");
  });

  it("prints Polish, Greek and Cyrillic with the Noto Sans files", async () => {
    const out = await editPdf(await makePdf([0]), [text({ text: "Zażółć gęślą jaźń\nΚαλημέρα Привет", width: 400 })], { loadFont: fontsFromDisk });
    const items = await shownItems(out);
    // Each font run is its own piece; joined, they read back as typed, on two lines.
    expect(items.map((i) => i.str).join("")).toContain("Zażółć gęślą jaźń");
    expect(items.map((i) => i.str).join("")).toContain("Привет");
    expect(new Set(items.map((i) => Math.round(i.y))).size).toBe(2);
  });

  it("names the text box and the page when characters cannot be printed", async () => {
    await expect(editPdf(await makePdf([0, 0]), [text({ page: 1, text: "Łódź" })])).rejects.toThrow(/text box on page 2 has characters the standard PDF font cannot print/);
  });

  it("underlines text along each line", async () => {
    const out = await editPdf(await makePdf([0]), [text({ underline: true, text: "Underlined" })]);
    // A line is a stroked path: "m", "l" then "S".
    expect(await contentOf(out)).toMatch(/ m\n[^\n]* l\nS/);
  });

  it("covers the original words before writing the replacement", async () => {
    const out = await editPdf(await makePdf([0]), [text({ text: "New words", cover: { left: 70, top: 95, width: 100, height: 20, color: { r: 1, g: 1, b: 1 } } })]);
    const content = await contentOf(out);
    // pdf-lib draws a filled rectangle as a closed path ("h") filled with "f".
    expect(content.indexOf("h\nf")).toBeGreaterThan(-1);
    expect(content.indexOf("h\nf")).toBeLessThan(content.indexOf("Tj"));
  });

  it("puts covers under every other edit, so a highlight made first still shows", async () => {
    const highlight: EditObject = { kind: "highlight", page: 0, left: 70, top: 95, width: 100, height: 20, color: { r: 1, g: 0.9, b: 0.2 }, opacity: 1 };
    const out = await editPdf(await makePdf([0]), [highlight, text({ text: "New", cover: { left: 70, top: 95, width: 100, height: 20, color: { r: 1, g: 1, b: 1 } } })]);
    const content = await contentOf(out);
    expect(content.indexOf("1 1 1 rg")).toBeGreaterThan(-1);
    expect(content.indexOf("1 1 1 rg")).toBeLessThan(content.indexOf("0.9 0.2 rg"));
  });

  it("skips an empty text box but keeps its cover (deleting words is an edit too)", async () => {
    const out = await editPdf(await makePdf([0]), [text({ text: "   ", cover: { left: 70, top: 95, width: 100, height: 20, color: { r: 1, g: 1, b: 1 } } })]);
    expect(await shownItems(out)).toEqual([]);
    expect(await contentOf(out)).toContain("h\nf");
  });

  it("draws a highlight that multiplies with the page, like a marker", async () => {
    const out = await editPdf(await makePdf([0]), [{ kind: "highlight", page: 0, left: 10, top: 10, width: 100, height: 14, color: { r: 1, g: 0.9, b: 0.2 }, opacity: 1 }]);
    const doc = await PDFDocument.load(out);
    const states = doc.getPage(0).node.Resources()?.lookup(PDFName.of("ExtGState"), PDFDict);
    const modes = states?.keys().map((k) => String(states.lookup(k, PDFDict).get(PDFName.of("BM"))));
    expect(modes).toContain("/Multiply");
  });

  it("stores a picture placed on several pages once, and puts it where it was placed", async () => {
    const png = makePng(20, 10);
    const pages = [0, 1, 2].map((page): EditObject => ({ kind: "image", page, left: 100, top: 50, width: 200, height: 100, image: png, opacity: 1 }));
    const out = await editPdf(await makePdf([0, 90, 0]), pages);
    const doc = await PDFDocument.load(out);
    const imageCount = doc.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of("Subtype"))) === "/Image").length;
    expect(imageCount).toBe(1);

    // On the turned page, the picture's corners land where they were placed on the page as shown.
    const page = doc.getPage(1);
    const box = page.getCropBox();
    const g: PageGeometry = { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height, rotate: 90 };
    let ctm: number[] | null = null;
    scanContent(await contentOf(out, 1), [1, 0, 0, 1, 0, 0], { onDo: (_n, m) => (ctm = [...m]) });
    const [a, b, c, d, e, f] = ctm as unknown as [number, number, number, number, number, number];
    const corner = (u: number, v: number) => userToDisplay(g, a * u + c * v + e, b * u + d * v + f);
    expect(corner(0, 1).u).toBeCloseTo(100, 6);
    expect(corner(0, 1).v).toBeCloseTo(50, 6);
    expect(corner(1, 0).u).toBeCloseTo(300, 6);
    expect(corner(1, 0).v).toBeCloseTo(150, 6);
  });

  it("draws shapes, lines with arrow heads, freehand ink, marks and whiteout", async () => {
    const red = { r: 0.8, g: 0.1, b: 0.1 };
    const out = await editPdf(await makePdf([0]), [
      { kind: "whiteout", page: 0, left: 0, top: 0, width: 50, height: 50, color: { r: 1, g: 1, b: 1 } },
      { kind: "rect", page: 0, left: 60, top: 60, width: 80, height: 40, stroke: red, fill: null, strokeWidth: 2, opacity: 1 },
      { kind: "ellipse", page: 0, left: 60, top: 120, width: 80, height: 40, stroke: null, fill: red, strokeWidth: 0, opacity: 0.5 },
      { kind: "line", page: 0, x1: 10, y1: 200, x2: 200, y2: 200, color: red, strokeWidth: 3, opacity: 1, arrow: "both" },
      { kind: "ink", page: 0, points: [10, 300, 20, 310, 40, 305, 60, 330], color: red, strokeWidth: 2, opacity: 1 },
      { kind: "mark", page: 0, symbol: "check", left: 300, top: 300, size: 20, color: red, opacity: 1 },
      { kind: "mark", page: 0, symbol: "dot", left: 330, top: 300, size: 20, color: red, opacity: 1 },
    ]);
    const content = await contentOf(out);
    // Round joins for the freehand line, and curves for its smooth path.
    expect(content).toContain("1 j");
    expect(content).toMatch(/ c\n/);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it("is not thrown off by a page that leaves its drawing state changed", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    // An unbalanced "q … cm" with no "Q": everything after it would be shifted by 100 points.
    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 1 0 0 1 100 100 cm 0 0 10 10 re f")));
    const out = await editPdf(await doc.save(), [text({ left: 72, top: 100, text: "Still here" })]);
    const [item] = (await shownItems(out)) as [ShownItem];
    expect(item.x).toBeCloseTo(72, 3);
  });

  it("refuses edits it cannot place, with a message that says why", async () => {
    const bytes = await makePdf([0]);
    await expect(editPdf(bytes, [])).rejects.toThrow("Add something to a page first.");
    await expect(editPdf(bytes, [text({ page: 3 })])).rejects.toThrow("Page 4 does not exist (this PDF has 1 pages).");
    await expect(editPdf(bytes, [text({ size: 400 })])).rejects.toThrow(/font size of 400/);
    await expect(editPdf(bytes, [text({ left: Number.NaN })])).rejects.toThrow(/no valid position/);
    await expect(editPdf(bytes, [{ kind: "image", page: 0, left: 0, top: 0, width: 10, height: 10, image: new Uint8Array([1, 2, 3, 4]), opacity: 1 }])).rejects.toThrow(/picture could not be read/);
  });
});
