import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { degrees, PDFDocument } from "pdf-lib";
import {
  addPageNumbers,
  addTextWatermark,
  deletePages,
  displayToPageSpace,
  extractPages,
  getPdfInfo,
  mergePdfs,
  PdfError,
  rotatePdf,
  setPdfMetadata,
  splitPdf,
} from "../src/pdf";

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "fixtures", "pdf", name)));

async function makePdf(pages: number, size: [number, number] = [200, 300]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage(size);
  return doc.save();
}

describe("displayToPageSpace", () => {
  const box = { x: 0, y: 0, width: 200, height: 300 };

  it("is the identity on an unrotated page", () => {
    expect(displayToPageSpace(box, 0, 10, 20)).toMatchObject({ x: 10, y: 20, rotate: 0, view: { width: 200, height: 300, rotation: 0 } });
  });

  it("swaps the visible size and maps the display corner for every rotation", () => {
    // Display bottom-left lands on the page's bottom-right, top-left and bottom-right... of the stored box.
    expect(displayToPageSpace(box, 90, 0, 0)).toMatchObject({ x: 200, y: 0, rotate: 90, view: { width: 300, height: 200, rotation: 90 } });
    expect(displayToPageSpace(box, 180, 0, 0)).toMatchObject({ x: 200, y: 300, rotate: 180, view: { width: 200, height: 300 } });
    expect(displayToPageSpace(box, 270, 0, 0)).toMatchObject({ x: 0, y: 300, rotate: 270, view: { width: 300, height: 200 } });
  });

  it("adds the crop box origin and the text angle", () => {
    const shifted = { x: 50, y: 40, width: 200, height: 300 };
    expect(displayToPageSpace(shifted, 0, 10, 20, 45)).toMatchObject({ x: 60, y: 60, rotate: 45 });
    expect(displayToPageSpace(shifted, 90, 10, 20, 45)).toMatchObject({ x: 50 + 180, y: 40 + 10, rotate: 135 });
  });

  it("normalises negative and oversized rotations", () => {
    expect(displayToPageSpace(box, -90, 0, 0).view.rotation).toBe(270);
    expect(displayToPageSpace(box, 450, 0, 0).view.rotation).toBe(90);
  });
});

describe("page numbers and watermark on rotated pages", () => {
  it("keeps the page count and rotation", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 300]).setRotation(degrees(90));
    doc.addPage([200, 300]);
    const bytes = await doc.save();
    for (const out of [await addPageNumbers(bytes, { position: "top-right" }), await addTextWatermark(bytes, { text: "DRAFT" })]) {
      const info = await getPdfInfo(out);
      expect(info.pageCount).toBe(2);
      expect(info.pages.map((p) => p.rotation)).toEqual([90, 0]);
    }
  });

  it("stamps a page whose crop box does not start at the origin", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    page.setCropBox(100, 100, 200, 200);
    const out = await addPageNumbers(await doc.save(), { position: "bottom-left", margin: 10 });
    expect((await getPdfInfo(out)).pageCount).toBe(1);
  });

  it("rejects a blank watermark", async () => {
    await expect(addTextWatermark(await makePdf(1), { text: "   " })).rejects.toThrow(PdfError);
  });
});

describe("rotatePdf", () => {
  it("turns a page once even when it is listed twice", async () => {
    const out = await rotatePdf(await makePdf(3), 90, [0, 1, 1]);
    expect((await getPdfInfo(out)).pages.map((p) => p.rotation)).toEqual([90, 90, 0]);
  });
});

describe("splitPdf, extractPages and deletePages", () => {
  it("splits into the expected parts from a single parse", async () => {
    const parts = await splitPdf(await makePdf(5), { type: "every", pages: 2 }, "doc");
    expect(parts.map((p) => p.name)).toEqual(["doc-1.pdf", "doc-2.pdf", "doc-3.pdf"]);
    expect(parts.map((p) => p.pages)).toEqual([[1, 2], [3, 4], [5]]);
    for (const part of parts) expect((await getPdfInfo(part.data)).pageCount).toBe(part.pages.length);
  });

  it("splits non-contiguous custom ranges", async () => {
    const parts = await splitPdf(await makePdf(6), { type: "ranges", spec: "1,3,5; 2" });
    expect(parts.map((p) => p.pages)).toEqual([[1, 3, 5], [2]]);
  });

  it("splits a 60-page document quickly (no repeated parsing)", async () => {
    const start = Date.now();
    const parts = await splitPdf(await makePdf(60), { type: "each" });
    expect(parts).toHaveLength(60);
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it("extracts in the given order and refuses an empty selection", async () => {
    const out = await extractPages(await makePdf(4), [3, 0]);
    expect((await getPdfInfo(out)).pageCount).toBe(2);
    await expect(extractPages(await makePdf(2), [])).rejects.toThrow("No pages selected.");
  });

  it("deletes pages and refuses to delete them all", async () => {
    const bytes = await makePdf(3);
    expect((await getPdfInfo(await deletePages(bytes, [1]))).pageCount).toBe(2);
    await expect(deletePages(bytes, [0, 1, 2])).rejects.toThrow("You cannot delete every page.");
  });
});

describe("setPdfMetadata keywords", () => {
  it("keeps a comma-separated list readable and clears it when emptied", async () => {
    const bytes = await makePdf(1);
    const set = await setPdfMetadata(bytes, { keywords: "invoice,  2026 ,tax" });
    expect((await getPdfInfo(set)).keywords).toBe("invoice, 2026, tax");
    const cleared = await setPdfMetadata(set, { keywords: "" });
    expect((await getPdfInfo(cleared)).keywords ?? "").toBe("");
  });
});

describe("encrypted and corrupt input", () => {
  const operations: [string, (b: Uint8Array) => Promise<unknown>][] = [
    ["merge", (b) => mergePdfs([b, b])],
    ["split", (b) => splitPdf(b, { type: "each" })],
    ["extract", (b) => extractPages(b, [0])],
    ["delete", (b) => deletePages(b, [0])],
    ["rotate", (b) => rotatePdf(b, 90)],
    ["page numbers", (b) => addPageNumbers(b)],
    ["watermark", (b) => addTextWatermark(b, { text: "X" })],
    ["metadata", (b) => setPdfMetadata(b, { title: "t" })],
  ];

  for (const [name, run] of operations) {
    it(`${name}: a password-protected file gives a readable error`, async () => {
      await expect(run(fixture("encrypted.pdf"))).rejects.toThrow(/password-protected/);
    });
    it(`${name}: a corrupt file gives a readable error`, async () => {
      await expect(run(fixture("corrupt.pdf"))).rejects.toThrow(/could not be read/);
    });
  }
});
