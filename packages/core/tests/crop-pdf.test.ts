import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { degrees, PDFDocument, PDFName } from "pdf-lib";
import { cropPdf, croppedRect, detectBlankMargins, fromPoints, NO_MARGINS, toPoints, tooMuchCropped } from "../src/crop-pdf";

async function makePdf(setup?: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  doc.addPage([200, 300]);
  setup?.(doc);
  return doc.save();
}

const boxOf = async (bytes: Uint8Array, page: number) => {
  const p = (await PDFDocument.load(bytes)).getPage(page);
  return { crop: p.getCropBox(), media: p.getMediaBox() };
};

describe("units", () => {
  it("converts to and from points", () => {
    expect(toPoints(1, "in")).toBe(72);
    expect(toPoints(25.4, "mm")).toBeCloseTo(72);
    expect(fromPoints(36, "in")).toBe(0.5);
    expect(fromPoints(toPoints(10, "mm"), "mm")).toBeCloseTo(10);
  });
});

describe("croppedRect", () => {
  const box = { x: 0, y: 0, width: 200, height: 300 };
  const margins = { top: 10, right: 20, bottom: 30, left: 40 };

  it("trims each side on an unrotated page", () => {
    expect(croppedRect(box, 0, margins)).toEqual({ x: 40, y: 30, width: 140, height: 260 });
  });

  it("applies the margins to the displayed sides when the page is rotated", () => {
    // Turned 90 degrees the reader sees a 300 x 200 page: stored width is the displayed height (minus top and bottom),
    // stored height is the displayed width (minus left and right).
    const r = croppedRect(box, 90, margins);
    expect(r.width).toBeCloseTo(200 - 10 - 30);
    expect(r.height).toBeCloseTo(300 - 40 - 20);
    const r180 = croppedRect(box, 180, margins);
    expect(r180).toEqual({ x: 20, y: 10, width: 140, height: 260 });
  });

  it("respects a box that does not start at the origin", () => {
    expect(croppedRect({ x: 50, y: 40, width: 200, height: 300 }, 0, margins)).toEqual({ x: 90, y: 70, width: 140, height: 260 });
  });
});

describe("cropPdf", () => {
  it("sets the crop and media box of every page by default", async () => {
    const out = await cropPdf(await makePdf(), { margins: { top: 10, right: 20, bottom: 30, left: 40 } });
    for (const i of [0, 1]) {
      const { crop, media } = await boxOf(out, i);
      expect(crop).toEqual({ x: 40, y: 30, width: 140, height: 260 });
      expect(media).toEqual(crop);
    }
  });

  it("crops only the chosen pages and can keep the page size", async () => {
    const out = await cropPdf(await makePdf(), { margins: { ...NO_MARGINS, left: 50 }, pageIndexes: [1], resizePage: false });
    expect((await boxOf(out, 0)).crop.width).toBe(200);
    const second = await boxOf(out, 1);
    expect(second.crop).toEqual({ x: 50, y: 0, width: 150, height: 300 });
    expect(second.media.width).toBe(200);
  });

  it("works on a rotated page", async () => {
    const out = await cropPdf(await makePdf((d) => d.getPage(0).setRotation(degrees(90))), { margins: { ...NO_MARGINS, top: 50 } });
    const { crop } = await boxOf(out, 0);
    // Displayed height is the stored width, so trimming the displayed top shrinks the stored width.
    expect(crop.width).toBe(150);
    expect(crop.height).toBe(300);
  });

  it("removes trim, bleed and art boxes", async () => {
    const bytes = await makePdf((d) => d.getPage(0).setTrimBox(0, 0, 100, 100));
    const out = await cropPdf(bytes, { margins: { ...NO_MARGINS, top: 5 } });
    expect((await PDFDocument.load(out)).getPage(0).node.has(PDFName.of("TrimBox"))).toBe(false);
  });

  it("rejects bad input with a readable message", async () => {
    const bytes = await makePdf();
    await expect(cropPdf(bytes, { margins: NO_MARGINS })).rejects.toThrow("at least one side");
    await expect(cropPdf(bytes, { margins: { ...NO_MARGINS, top: -1 } })).rejects.toThrow("top margin");
    await expect(cropPdf(bytes, { margins: { ...NO_MARGINS, top: Number.NaN } })).rejects.toThrow("top margin");
    await expect(cropPdf(bytes, { margins: { ...NO_MARGINS, left: 195, right: 0 } })).rejects.toThrow("almost nothing");
    await expect(cropPdf(bytes, { margins: { ...NO_MARGINS, left: 10 }, pageIndexes: [] })).rejects.toThrow("No pages selected");
    await expect(cropPdf(bytes, { margins: { ...NO_MARGINS, left: 10 }, pageIndexes: [5] })).rejects.toThrow("Page 6 does not exist");
  });

  it("explains encrypted and corrupt files", async () => {
    const dir = join(__dirname, "fixtures", "pdf");
    const margins = { ...NO_MARGINS, top: 5 };
    await expect(cropPdf(new Uint8Array(readFileSync(join(dir, "encrypted.pdf"))), { margins })).rejects.toThrow(/password-protected/);
    await expect(cropPdf(new Uint8Array(readFileSync(join(dir, "corrupt.pdf"))), { margins })).rejects.toThrow(/could not be read/);
  });
});

describe("tooMuchCropped", () => {
  it("flags margins that leave under 10 points", () => {
    expect(tooMuchCropped({ width: 100, height: 100 }, { top: 0, right: 0, bottom: 0, left: 95 })).toBe(true);
    expect(tooMuchCropped({ width: 100, height: 100 }, { top: 10, right: 10, bottom: 10, left: 10 })).toBe(false);
  });
});

describe("detectBlankMargins", () => {
  const picture = (w: number, h: number, ink: [number, number, number, number]) => {
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = ink[1]; y <= ink[3]; y++) for (let x = ink[0]; x <= ink[2]; x++) rgba.set([0, 0, 0, 255], (y * w + x) * 4);
    return rgba;
  };

  it("measures the white border around content", () => {
    const m = detectBlankMargins(picture(100, 200, [20, 40, 79, 159]), 100, 200, 245, 0);
    expect(m).toEqual({ left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 });
  });

  it("keeps a little breathing room and never goes negative", () => {
    const m = detectBlankMargins(picture(100, 100, [0, 0, 99, 99]), 100, 100);
    expect(m).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    const padded = detectBlankMargins(picture(100, 100, [10, 10, 89, 89]), 100, 100, 245, 0.05)!;
    expect(padded.left).toBeCloseTo(0.05);
  });

  it("returns null for a blank page", () => {
    expect(detectBlankMargins(new Uint8ClampedArray(40 * 4).fill(255), 10, 4)).toBeNull();
  });
});
