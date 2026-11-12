import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, degrees } from "pdf-lib";
import {
  assembleRedacted,
  boxPixelRects,
  clampBoxes,
  dedupeBoxes,
  matchBoxes,
  multiplyMatrix,
  pagesToRasterise,
  searchPattern,
  type RasterPage,
  type RedactBox,
  type TextItemLike,
} from "../src/redact-pdf";
import { readBack } from "./pdf-read-back";

/** A real PNG of one colour, built with node's zlib. */
function makePng(width: number, height: number): Uint8Array {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of buf) c = (table[(c ^ b) & 0xff] as number) ^ (c >>> 8);
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
  header.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array((width * 3 + 1) * height);
  const idat = deflateSync(rows);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const raster = (widthPt: number, heightPt: number): RasterPage => ({ image: makePng(40, 50), kind: "png", widthPt, heightPt });

async function memo(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Confidential memo");
  doc.setAuthor("Jane Q. Analyst");
  doc.setKeywords(["secret"]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 500]).drawText("Account SECRET-4821 belongs to J. Doe", { x: 40, y: 400, size: 14, font });
  doc.addPage([400, 500]).drawText("Public notes", { x: 40, y: 400, size: 14, font });
  const turned = doc.addPage([300, 200]);
  turned.setRotation(degrees(90));
  turned.drawText("Turned page", { x: 20, y: 100, size: 12, font });
  return doc.save();
}

/** Every stream of the file, decoded, as one string: where hidden text would be found by anyone who looks. */
async function everyStream(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) out.push(Buffer.from(decodePDFRawStream(object).decode()).toString("latin1"));
  }
  return out.join("\n");
}

const raw = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

/** True when the text is in the file as typed, or as the hex string pdf-lib writes when it draws text. */
const holds = (haystack: string, word: string) => haystack.includes(word) || haystack.toUpperCase().includes(Buffer.from(word).toString("hex").toUpperCase());

describe("assembleRedacted", () => {
  it("replaces a marked page with a picture: its text, fonts and commands are gone from the file", async () => {
    const original = await memo();
    expect(await readBack(original, 1)).toContain("SECRET-4821");
    // The check below can fail: the same search finds the text in the original.
    expect(holds(await everyStream(original), "SECRET")).toBe(true);
    const out = await assembleRedacted(original, new Map([[0, raster(400, 500)]]));

    expect(await readBack(out, 1)).toBe("");
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    // pdf-lib leaves an empty font table on every page; what matters is that it names no font.
    const fonts = doc.getPage(0).node.Resources()?.get(PDFName.of("Font"));
    expect(fonts === undefined || (fonts instanceof PDFDict && fonts.keys().length === 0)).toBe(true);
    const all = await everyStream(out);
    expect(holds(all, "SECRET")).toBe(false);
    expect(holds(all, "J. Doe")).toBe(false);
    expect(holds(raw(out), "SECRET")).toBe(false);
  });

  it("keeps the pages that were not marked as they were, including a turned one", async () => {
    const out = await assembleRedacted(await memo(), new Map([[0, raster(400, 500)]]));
    expect(await readBack(out, 2)).toBe("Public notes");
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(2).getRotation().angle).toBe(90);
    expect(await readBack(out, 3)).toBe("Turned page");
  });

  it("starts with none of the original properties", async () => {
    const out = await assembleRedacted(await memo(), new Map([[0, raster(400, 500)]]));
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getTitle()).toBeUndefined();
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getKeywords()).toBeUndefined();
    const text = raw(out) + (await everyStream(out));
    expect(holds(text, "Confidential memo")).toBe(false);
    expect(holds(text, "Analyst")).toBe(false);
  });

  it("gives the new page the size the reader saw", async () => {
    const out = await assembleRedacted(await memo(), new Map([[2, raster(200, 300)]]));
    const page = (await PDFDocument.load(out, { updateMetadata: false })).getPage(2);
    expect(page.getSize()).toEqual({ width: 200, height: 300 });
    expect(page.getRotation().angle).toBe(0);
  });

  it("can turn every page into a picture", async () => {
    const out = await assembleRedacted(await memo(), new Map([0, 1, 2].map((i) => [i, raster(400, 500)] as const)));
    for (const n of [1, 2, 3]) expect(await readBack(out, n)).toBe("");
    expect(holds(await everyStream(out), "Public notes")).toBe(false);
  });

  it("refuses an empty job, a page that does not exist, and bad files", async () => {
    const original = await memo();
    await expect(assembleRedacted(original, new Map())).rejects.toThrow(/nothing to redact/);
    await expect(assembleRedacted(original, new Map([[5, raster(10, 10)]]))).rejects.toThrow(/Page 6 does not exist/);
    await expect(assembleRedacted(original, new Map([[0, { image: new Uint8Array([1, 2, 3]), kind: "png", widthPt: 10, heightPt: 10 }]]))).rejects.toThrow(/could not be saved as a picture/);
    await expect(assembleRedacted(new Uint8Array([1, 2, 3, 4]), new Map([[0, raster(10, 10)]]))).rejects.toThrow();
  });

  it("leaves no form fields or filled-in values in the file", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const field = doc.getForm().createTextField("ssn");
    field.setText("123-45-6789");
    field.addToPage(page, { x: 20, y: 200, width: 150, height: 24 });
    const out = await assembleRedacted(await doc.save(), new Map([[0, raster(300, 300)]]));
    const reread = await PDFDocument.load(out, { updateMetadata: false });
    // Checked first: asking pdf-lib for the form creates an empty one.
    expect(reread.catalog.get(PDFName.of("AcroForm"))).toBeUndefined();
    expect(holds(raw(out) + (await everyStream(out)), "123-45-6789")).toBe(false);
    const annots = reread.getPage(0).node.get(PDFName.of("Annots"));
    expect(annots === undefined || (annots instanceof PDFArray && annots.size() === 0)).toBe(true);
  });
});

describe("clampBoxes", () => {
  const sizes = [
    { width: 400, height: 500 },
    { width: 300, height: 200 },
  ];
  const box = (extra: Partial<RedactBox> = {}): RedactBox => ({ page: 0, left: 10, top: 10, width: 100, height: 20, ...extra });

  it("keeps boxes that fit and trims the part that hangs over the edge", () => {
    expect(clampBoxes([box()], sizes)).toEqual([box()]);
    expect(clampBoxes([box({ left: -20, width: 60, top: 480, height: 50 })], sizes)).toEqual([{ page: 0, left: 0, top: 480, width: 40, height: 20 }]);
  });
  it("explains boxes that cannot work", () => {
    expect(() => clampBoxes([box({ page: 5 })], sizes)).toThrow(/Box 1 is on page 6/);
    expect(() => clampBoxes([box({ left: 900 })], sizes)).toThrow(/outside page 1/);
    expect(() => clampBoxes([box({ height: 0.4 })], sizes)).toThrow(/thinner than 1 point/);
    expect(() => clampBoxes([box({ left: NaN })], sizes)).toThrow(/needs a position and a size/);
    expect(() => clampBoxes(Array.from({ length: 2001 }, () => box()), sizes)).toThrow(/At most 2000/);
  });
});

describe("pagesToRasterise", () => {
  const boxes: RedactBox[] = [3, 1, 3, 0].map((page) => ({ page, left: 0, top: 0, width: 5, height: 5 }));
  it("lists each marked page once, in order, or every page", () => {
    expect(pagesToRasterise(boxes, 6, false)).toEqual([0, 1, 3]);
    expect(pagesToRasterise(boxes, 3, true)).toEqual([0, 1, 2]);
    expect(pagesToRasterise([], 3, false)).toEqual([]);
  });
});

describe("boxPixelRects", () => {
  it("rounds outwards and pads, so the black always covers the marked area", () => {
    const [rect] = boxPixelRects([{ page: 0, left: 10.4, top: 20.2, width: 50.3, height: 12.1 }], { width: 400, height: 500 }, 800, 1000);
    // 2 pixels per point; padded by 1 pt = 2 px each way.
    expect(rect!.x).toBe(Math.floor(9.4 * 2));
    expect(rect!.y).toBe(Math.floor(19.2 * 2));
    expect(rect!.x + rect!.width).toBe(Math.ceil(61.7 * 2));
    expect(rect!.y + rect!.height).toBe(Math.ceil(33.3 * 2));
    expect(rect!.x).toBeLessThanOrEqual(10.4 * 2);
    expect(rect!.x + rect!.width).toBeGreaterThanOrEqual(60.7 * 2);
  });
  it("stays inside the picture", () => {
    const [rect] = boxPixelRects([{ page: 0, left: 0, top: 0, width: 400, height: 500 }], { width: 400, height: 500 }, 600, 750);
    expect(rect).toEqual({ x: 0, y: 0, width: 600, height: 750 });
  });
});

describe("searching page text", () => {
  /** A page 612 × 792 drawn at scale 1: PDF space flipped so y counts down from the top. */
  const viewport = [1, 0, 0, -1, 0, 792];
  const line = (str: string, x: number, y: number, width = str.length * 6): TextItemLike => ({ str, transform: [12, 0, 0, 12, x, y], width });

  it("multiplies matrices like PDF.js", () => {
    expect(multiplyMatrix(viewport, [12, 0, 0, 12, 100, 700])).toEqual([12, 0, 0, -12, 100, 92]);
  });

  it("boxes just the matched share of a line", () => {
    const spec = { kind: "text", term: "555-1234", matchCase: false } as const;
    const [box] = matchBoxes([line("Call 555-1234 now", 100, 700)], viewport, 1, spec, 0);
    expect(box?.text).toBe("555-1234");
    // The line is 17 characters over 102 pt; the match is characters 5 to 13.
    expect(box?.left).toBeCloseTo(100 + (102 * 5) / 17, 5);
    expect(box!.left + box!.width).toBeCloseTo(100 + (102 * 13) / 17, 5);
    // Baseline at 92 from the top; glyphs reach 12 up and 3 down.
    expect(box?.top).toBeCloseTo(92 - 12, 5);
    expect(box!.top + box!.height).toBeCloseTo(92 + 3, 5);
  });

  it("finds a match that PDF.js split into two pieces, and adds padding", () => {
    const items = [line("jane.doe@exam", 50, 600), line("ple.com", 50 + 13 * 6, 600)];
    const boxes = matchBoxes(items, viewport, 1, { kind: "email", term: "", matchCase: false });
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.text).toBe("jane.doe@example.com");
    expect(boxes[0]!.left).toBeCloseTo(50 - 1.5, 5);
    expect(boxes[1]!.left + boxes[1]!.width).toBeCloseTo(50 + 20 * 6 + 1.5, 5);
  });

  it("matches without regard to case unless asked, and treats the words literally", () => {
    const items = [line("Total (USD) $5.00 total", 40, 500)];
    expect(matchBoxes(items, viewport, 1, { kind: "text", term: "total", matchCase: false })).toHaveLength(2);
    expect(matchBoxes(items, viewport, 1, { kind: "text", term: "total", matchCase: true })).toHaveLength(1);
    expect(matchBoxes(items, viewport, 1, { kind: "text", term: "(USD) $5.00", matchCase: false })).toHaveLength(1);
    expect(matchBoxes(items, viewport, 1, { kind: "text", term: "   ", matchCase: false })).toEqual([]);
  });

  it("finds phone and account numbers but not short numbers", () => {
    const items = [line("Call +1 (555) 123-4567 or 12 items, acct 4111 1111 1111 1111", 40, 500)];
    const found = matchBoxes(items, viewport, 1, { kind: "numbers", term: "", matchCase: false }).map((b) => b.text);
    expect(found).toEqual(["+1 (555) 123-4567", "4111 1111 1111 1111"]);
  });

  it("follows text on a page turned a quarter turn, at a larger scale", () => {
    // PDF.js's transform for a page turned 90° drawn at 2×: page x runs down the picture, page y runs across it.
    const turned = [0, 2, 2, 0, 0, 0];
    const [box] = matchBoxes([line("secret", 100, 700, 36)], turned, 2, { kind: "text", term: "secret", matchCase: false }, 0);
    // The text now runs down the page: narrow and tall in page points.
    expect(box!.height).toBeCloseTo(36, 5);
    expect(box!.width).toBeCloseTo(15, 5);
  });

  it("ignores empty pieces and zero-width ones", () => {
    const items = [line("", 10, 10), { str: "ghost", transform: [12, 0, 0, 12, 10, 10], width: 0 }];
    expect(matchBoxes(items, viewport, 1, { kind: "text", term: "ghost", matchCase: false })).toEqual([]);
  });

  it("uses the measured position of the letters when it is given", () => {
    const items = [line("Call 555-1234 now", 100, 700)];
    const spec = { kind: "text", term: "555-1234", matchCase: false } as const;
    const [box] = matchBoxes(items, viewport, 1, spec, 0, (item, from, to) => {
      expect([from, to]).toEqual([5, 13]);
      expect(item.str).toBe("Call 555-1234 now");
      return [0.25, 0.9];
    });
    expect(box!.left).toBeCloseTo(100 + 102 * 0.25, 5);
    expect(box!.left + box!.width).toBeCloseTo(100 + 102 * 0.9, 5);
  });

  it("covers the whole piece when the letters cannot be measured, and for right-to-left text", () => {
    const spec = { kind: "text", term: "555", matchCase: false } as const;
    const item = line("Call 555-1234 now", 100, 700);
    const [unknown] = matchBoxes([item], viewport, 1, spec, 0, () => null);
    expect(unknown!.left).toBeCloseTo(100, 5);
    expect(unknown!.left + unknown!.width).toBeCloseTo(202, 5);
    const [rtl] = matchBoxes([{ ...item, dir: "rtl" }], viewport, 1, spec, 0, () => [0.3, 0.4]);
    expect(rtl!.left).toBeCloseTo(100, 5);
    expect(rtl!.left + rtl!.width).toBeCloseTo(202, 5);
  });

  it("keeps a measured range inside the piece, whichever way round it comes", () => {
    const spec = { kind: "text", term: "555", matchCase: false } as const;
    const [box] = matchBoxes([line("Call 555-1234 now", 100, 700)], viewport, 1, spec, 0, () => [1.4, -0.2]);
    expect(box!.left).toBeCloseTo(100, 5);
    expect(box!.left + box!.width).toBeCloseTo(202, 5);
  });

  it("builds patterns", () => {
    expect(searchPattern({ kind: "text", term: "", matchCase: false })).toBeNull();
    expect(searchPattern({ kind: "email", term: "", matchCase: false })).toBeInstanceOf(RegExp);
  });
});

describe("dedupeBoxes", () => {
  it("drops a box inside another on the same page and keeps one of two equal boxes", () => {
    const a = { page: 0, left: 10, top: 10, width: 100, height: 20 };
    const inner = { page: 0, left: 20, top: 12, width: 30, height: 10 };
    const other = { page: 1, left: 20, top: 12, width: 30, height: 10 };
    expect(dedupeBoxes([a, inner, other, { ...a }])).toEqual([a, other]);
  });
});
