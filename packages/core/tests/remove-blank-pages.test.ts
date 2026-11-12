import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { BLANK_LIMITS, inkRatio, isBlank, pagesToRemove, removeBlankPages } from "../src/remove-blank-pages";
import { getPdfInfo } from "../src/pdf";

/** A w x h picture filled with one grey level, with an optional black block (inclusive corners) drawn on it. */
function picture(w: number, h: number, paper = 255, block?: [number, number, number, number]) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([paper, paper, paper, 255], i * 4);
  if (block) for (let y = block[1]; y <= block[3]; y++) for (let x = block[0]; x <= block[2]; x++) rgba.set([0, 0, 0, 255], (y * w + x) * 4);
  return rgba;
}

describe("inkRatio", () => {
  it("is zero for an empty page", () => {
    expect(inkRatio(picture(100, 100), 100, 100)).toBe(0);
  });

  it("measures the share covered by dark pixels", () => {
    // A 20 x 10 block on a 100 x 100 page is 2% of the page.
    expect(inkRatio(picture(100, 100, 255, [40, 40, 59, 49]), 100, 100, { edge: 0 })).toBeCloseTo(0.02, 5);
  });

  it("treats a cream or grey scan as blank when it is evenly coloured", () => {
    expect(inkRatio(picture(100, 100, 235), 100, 100)).toBe(0);
    expect(inkRatio(picture(100, 100, 180), 100, 100)).toBe(0);
  });

  it("ignores lone dark pixels but counts a mark made of touching pixels", () => {
    const lone = picture(100, 100, 255);
    for (let i = 0; i < 20; i++) lone.set([0, 0, 0, 255], ((i * 4) * 100 + i * 4 + 10) * 4);
    expect(inkRatio(lone, 100, 100, { edge: 0 })).toBe(0);
    expect(inkRatio(lone, 100, 100, { edge: 0, despeckle: false })).toBeGreaterThan(0);
    expect(inkRatio(picture(100, 100, 255, [40, 40, 41, 41]), 100, 100, { edge: 0 })).toBeCloseTo(4 / 10000, 6);
  });

  it("ignores faint speckle that is not clearly darker than the paper", () => {
    const rgba = picture(100, 100, 250);
    for (let i = 0; i < 100; i++) rgba.set([230, 230, 230, 255], (i * 97 % 10000) * 4);
    expect(inkRatio(rgba, 100, 100)).toBe(0);
  });

  it("ignores the border where scanners leave shadows", () => {
    expect(inkRatio(picture(100, 100, 255, [0, 0, 99, 1]), 100, 100, { edge: 0.05 })).toBe(0);
    expect(inkRatio(picture(100, 100, 255, [0, 0, 99, 1]), 100, 100, { edge: 0 })).toBeGreaterThan(0.01);
  });

  it("counts transparent pixels as white paper", () => {
    const rgba = new Uint8ClampedArray(10 * 10 * 4); // all zero: fully transparent black
    expect(inkRatio(rgba, 10, 10)).toBe(0);
  });

  it("copes with tiny or fully ignored pictures", () => {
    expect(inkRatio(new Uint8ClampedArray(0), 0, 0)).toBe(0);
    expect(inkRatio(picture(2, 2), 2, 2, { edge: 0.2 })).toBe(0);
  });
});

describe("sensitivity", () => {
  it("gets looser from strict to loose", () => {
    expect(BLANK_LIMITS.strict).toBeLessThan(BLANK_LIMITS.normal);
    expect(BLANK_LIMITS.normal).toBeLessThan(BLANK_LIMITS.loose);
  });

  it("decides blankness against the limit", () => {
    expect(isBlank(0, "strict")).toBe(true);
    expect(isBlank(0.00005, "strict")).toBe(false); // a lone page number
    expect(isBlank(0.00005, "normal")).toBe(true);
    expect(isBlank(0.0004, "normal")).toBe(false); // a footer line
    expect(isBlank(0.0004, "loose")).toBe(true);
    expect(isBlank(0.0028, "loose")).toBe(false); // a short heading
  });
});

describe("pagesToRemove", () => {
  const ratios = [0.2, 0, 0.00005, 0.1, 0.0004];

  it("picks the pages within the limit", () => {
    expect(pagesToRemove(ratios, "strict")).toEqual([1]);
    expect(pagesToRemove(ratios, "normal")).toEqual([1, 2]);
    expect(pagesToRemove(ratios, "loose")).toEqual([1, 2, 4]);
  });

  it("lets manual choices win in both directions", () => {
    const overrides = new Map([
      [0, true],
      [1, false],
    ]);
    expect(pagesToRemove(ratios, "normal", overrides)).toEqual([0, 2]);
  });
});

describe("removeBlankPages", () => {
  async function makePdf(pages: number) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
    return doc.save();
  }

  it("removes the chosen pages", async () => {
    const out = await removeBlankPages(await makePdf(5), [1, 3]);
    expect((await getPdfInfo(out)).pageCount).toBe(3);
  });

  it("explains when nothing is marked or everything is", async () => {
    const bytes = await makePdf(2);
    await expect(removeBlankPages(bytes, [])).rejects.toThrow("No pages are marked for removal.");
    await expect(removeBlankPages(bytes, [0, 1])).rejects.toThrow("You cannot delete every page.");
  });

  it("explains encrypted and corrupt files", async () => {
    const dir = join(__dirname, "fixtures", "pdf");
    await expect(removeBlankPages(new Uint8Array(readFileSync(join(dir, "encrypted.pdf"))), [0])).rejects.toThrow(/password-protected/);
    await expect(removeBlankPages(new Uint8Array(readFileSync(join(dir, "corrupt.pdf"))), [0])).rejects.toThrow(/could not be read/);
  });
});
