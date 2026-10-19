import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  addPageNumbers,
  addTextWatermark,
  deletePages,
  extractPages,
  getPdfInfo,
  imagesToPdf,
  isPdf,
  mergePdfs,
  parsePageRanges,
  PdfError,
  rotatePdf,
  setPdfMetadata,
  splitPdf,
  stripPdfMetadata,
} from "../src/pdf";
import { detectImageKind, ImageFormatError, stripImageMetadata, stripJpegMetadata, stripPngMetadata, stripWebpMetadata } from "../src/image-meta";

async function makePdf(pages: number, title?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200 + i, 300]);
    page.drawText(`Page ${i + 1}`, { x: 20, y: 150 });
  }
  if (title) {
    doc.setTitle(title);
    doc.setAuthor("Ada");
  }
  return doc.save();
}

describe("parsePageRanges", () => {
  it("parses numbers, ranges and open ends", () => {
    expect(parsePageRanges("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges("8-", 10)).toEqual([7, 8, 9]);
    expect(parsePageRanges("-2", 10)).toEqual([0, 1]);
    expect(parsePageRanges("last", 10)).toEqual([9]);
    expect(parsePageRanges("3-1", 5)).toEqual([2, 1, 0]);
    expect(parsePageRanges("2,2", 5)).toEqual([1, 1]);
  });
  it("rejects invalid input with friendly errors", () => {
    expect(() => parsePageRanges("", 5)).toThrow(PdfError);
    expect(() => parsePageRanges("0", 5)).toThrow(/out of range/);
    expect(() => parsePageRanges("6", 5)).toThrow(/out of range/);
    expect(() => parsePageRanges("x", 5)).toThrow(/not a valid page/);
  });
});

describe("PDF operations", () => {
  it("detects PDFs", async () => {
    expect(isPdf(await makePdf(1))).toBe(true);
    expect(isPdf(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
  });

  it("merges documents in order", async () => {
    const merged = await mergePdfs([await makePdf(2), await makePdf(3)]);
    const info = await getPdfInfo(merged);
    expect(info.pageCount).toBe(5);
    expect(info.pages.map((p) => p.width)).toEqual([200, 201, 200, 201, 202]);
  });
  it("needs at least two files and rejects non-PDFs", async () => {
    await expect(mergePdfs([await makePdf(1)])).rejects.toThrow(/at least two/);
    await expect(mergePdfs([await makePdf(1), new Uint8Array([1, 2, 3])])).rejects.toThrow(/File 2 could not be read/);
  });

  it("extracts and deletes pages", async () => {
    const pdf = await makePdf(5);
    expect((await getPdfInfo(await extractPages(pdf, [4, 0]))).pages.map((p) => p.width)).toEqual([204, 200]);
    expect((await getPdfInfo(await deletePages(pdf, [0, 1]))).pageCount).toBe(3);
    await expect(deletePages(pdf, [0, 1, 2, 3, 4])).rejects.toThrow(/every page/);
    await expect(extractPages(pdf, [])).rejects.toThrow(/No pages/);
  });

  it("splits one file per page, in chunks, or by ranges", async () => {
    const pdf = await makePdf(5);
    const each = await splitPdf(pdf, { type: "each" }, "doc");
    expect(each.map((p) => p.name)).toEqual(["doc-1.pdf", "doc-2.pdf", "doc-3.pdf", "doc-4.pdf", "doc-5.pdf"]);
    const chunks = await splitPdf(pdf, { type: "every", pages: 2 });
    expect(chunks.map((c) => c.pages)).toEqual([[1, 2], [3, 4], [5]]);
    const ranges = await splitPdf(pdf, { type: "ranges", spec: "1-2; 4-5" });
    expect(ranges.map((c) => c.pages)).toEqual([[1, 2], [4, 5]]);
    expect((await getPdfInfo((ranges[1] as { data: Uint8Array }).data)).pageCount).toBe(2);
    await expect(splitPdf(pdf, { type: "every", pages: 0 })).rejects.toThrow(PdfError);
    await expect(splitPdf(pdf, { type: "ranges", spec: " ; " })).rejects.toThrow(PdfError);
  });

  it("rotates all or selected pages", async () => {
    const pdf = await makePdf(3);
    expect((await getPdfInfo(await rotatePdf(pdf, 90))).pages.map((p) => p.rotation)).toEqual([90, 90, 90]);
    expect((await getPdfInfo(await rotatePdf(pdf, 180, [1]))).pages.map((p) => p.rotation)).toEqual([0, 180, 0]);
    const twice = await rotatePdf(await rotatePdf(pdf, 270), 180);
    expect((await getPdfInfo(twice)).pages[0]?.rotation).toBe(90);
  });

  it("reads, sets and strips metadata", async () => {
    const pdf = await makePdf(1, "Secret plans");
    expect(await getPdfInfo(pdf)).toMatchObject({ title: "Secret plans", author: "Ada" });
    const edited = await setPdfMetadata(pdf, { title: "Public", keywords: "a, b" });
    expect(await getPdfInfo(edited)).toMatchObject({ title: "Public", author: "Ada", keywords: "a b" });
    const stripped = await getPdfInfo(await stripPdfMetadata(pdf));
    expect(stripped.title).toBeUndefined();
    expect(stripped.author).toBeUndefined();
    expect(stripped.pageCount).toBe(1);
  });

  it("adds page numbers and watermarks without changing page count", async () => {
    const pdf = await makePdf(3);
    const numbered = await addPageNumbers(pdf, { format: "n-of-total", position: "bottom-right" });
    expect((await getPdfInfo(numbered)).pageCount).toBe(3);
    expect(numbered.length).toBeGreaterThan(pdf.length);
    const marked = await addTextWatermark(pdf, { text: "DRAFT" });
    expect(marked.length).toBeGreaterThan(pdf.length);
    await expect(addTextWatermark(pdf, { text: "  " })).rejects.toThrow(PdfError);
  });

  it("converts images to PDF", async () => {
    // 1×1 transparent PNG
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const a4 = await getPdfInfo(await imagesToPdf([{ data: png, type: "png" }]));
    expect(a4.pages[0]).toMatchObject({ width: 595.28, height: 841.89 });
    const fit = await getPdfInfo(await imagesToPdf([{ data: png, type: "png" }, { data: png, type: "png" }], { pageSize: "fit" }));
    expect(fit.pageCount).toBe(2);
    expect(fit.pages[0]).toMatchObject({ width: 1, height: 1 });
    const landscape = await getPdfInfo(await imagesToPdf([{ data: png, type: "png" }], { pageSize: "letter", landscape: true }));
    expect(landscape.pages[0]).toMatchObject({ width: 792, height: 612 });
    await expect(imagesToPdf([])).rejects.toThrow(PdfError);
    await expect(imagesToPdf([{ data: new Uint8Array([1, 2, 3]), type: "jpeg" }])).rejects.toThrow(/could not be read/);
  });
});

/* ------------------------------ image metadata ------------------------------ */

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

function jpegSegment(marker: number, payload: Uint8Array): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}

function makeJpeg() {
  const scan = [0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9]; // SOS + fake entropy data + EOI
  return bytes(
    [0xff, 0xd8],
    jpegSegment(0xe0, bytes("JFIF\0", [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    jpegSegment(0xe1, bytes("Exif\0\0", "GPS DATA HERE")),
    jpegSegment(0xe1, bytes("http://ns.adobe.com/xap/1.0/\0", "<xmp/>")),
    jpegSegment(0xe2, bytes("ICC_PROFILE\0", [1, 1, 9, 9])),
    jpegSegment(0xed, bytes("Photoshop 3.0\0")),
    jpegSegment(0xfe, bytes("a comment")),
    jpegSegment(0xdb, new Uint8Array(65)),
    scan,
  );
}

function pngChunk(type: string, data: number[] = []): number[] {
  const len = data.length;
  return [len >>> 24, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function makePng() {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    pngChunk("tEXt", Array.from("Author\0Ada", (c) => c.charCodeAt(0))),
    pngChunk("eXIf", [1, 2, 3, 4]),
    pngChunk("tIME", [7, 234, 10, 19, 1, 2, 3]),
    pngChunk("iCCP", [1, 2, 3]),
    pngChunk("IDAT", [9, 9, 9]),
    pngChunk("IEND"),
  );
}

function riffChunk(type: string, data: number[]): number[] {
  const pad = data.length % 2 ? [0] : [];
  return [...Array.from(type, (c) => c.charCodeAt(0)), data.length & 255, (data.length >> 8) & 255, 0, 0, ...data, ...pad];
}

function makeWebp() {
  const body = [
    ...Array.from("WEBP", (c) => c.charCodeAt(0)),
    ...riffChunk("VP8X", [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // ICC | EXIF | XMP flags set
    ...riffChunk("VP8 ", [1, 2, 3, 4, 5]),
    ...riffChunk("EXIF", [9, 9, 9]),
    ...riffChunk("XMP ", [8, 8]),
  ];
  const size = body.length;
  return bytes(Array.from("RIFF", (c) => c.charCodeAt(0)), [size & 255, (size >> 8) & 255, 0, 0], body);
}

describe("detectImageKind", () => {
  it("recognises formats by magic bytes", () => {
    expect(detectImageKind(makeJpeg())).toBe("jpeg");
    expect(detectImageKind(makePng())).toBe("png");
    expect(detectImageKind(makeWebp())).toBe("webp");
    expect(detectImageKind(bytes("GIF89a"))).toBe("gif");
    expect(detectImageKind(bytes("BM", [0, 0]))).toBe("bmp");
    expect(detectImageKind(bytes("hello"))).toBe("unknown");
  });
});

describe("stripJpegMetadata", () => {
  it("removes EXIF, XMP, IPTC and comments but keeps JFIF, tables and pixel data", () => {
    const { data, removed } = stripJpegMetadata(makeJpeg());
    expect(removed.map((r) => r.name)).toEqual(["EXIF", "XMP", "Photoshop / IPTC", "Comment"]);
    const text = Array.from(data, (b) => String.fromCharCode(b)).join("");
    expect(text).toContain("JFIF");
    expect(text).toContain("ICC_PROFILE");
    expect(text).not.toContain("GPS DATA");
    expect(text).not.toContain("a comment");
    expect(Array.from(data.slice(-5))).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
    expect(Array.from(data.slice(0, 2))).toEqual([0xff, 0xd8]);
  });
  it("can also drop the ICC profile", () => {
    const { removed } = stripJpegMetadata(makeJpeg(), { keepColorProfile: false });
    expect(removed.map((r) => r.name)).toContain("ICC profile");
  });
  it("is idempotent", () => {
    const once = stripJpegMetadata(makeJpeg()).data;
    const twice = stripJpegMetadata(once);
    expect(twice.removed).toEqual([]);
    expect(Array.from(twice.data)).toEqual(Array.from(once));
  });
  it("rejects other formats and damaged structure", () => {
    expect(() => stripJpegMetadata(makePng())).toThrow(ImageFormatError);
    expect(() => stripJpegMetadata(bytes([0xff, 0xd8, 0xff], [0x00, 0x00]))).toThrow(ImageFormatError);
  });
});

describe("stripPngMetadata", () => {
  it("removes text, EXIF and time chunks but keeps critical chunks and the profile", () => {
    const { data, removed } = stripPngMetadata(makePng());
    expect(removed.map((r) => r.name)).toEqual(["tEXt", "eXIf", "tIME"]);
    const text = Array.from(data, (b) => String.fromCharCode(b)).join("");
    for (const keep of ["IHDR", "iCCP", "IDAT", "IEND"]) expect(text).toContain(keep);
    for (const drop of ["tEXt", "eXIf", "tIME"]) expect(text).not.toContain(drop);
  });
  it("drops the colour profile on request", () => {
    expect(stripPngMetadata(makePng(), { keepColorProfile: false }).removed.map((r) => r.name)).toContain("iCCP");
  });
  it("rejects truncated files", () => {
    expect(() => stripPngMetadata(makePng().slice(0, 40))).toThrow(ImageFormatError);
  });
});

describe("stripWebpMetadata", () => {
  it("removes EXIF/XMP, clears VP8X flags and fixes the RIFF size", () => {
    const { data, removed } = stripWebpMetadata(makeWebp());
    expect(removed.map((r) => r.name)).toEqual(["EXIF", "XMP"]);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(4, true)).toBe(data.length - 8);
    expect(data[20]).toBe(0x2c & ~0x0c); // flags byte follows "VP8X" + size
    const text = Array.from(data, (b) => String.fromCharCode(b)).join("");
    expect(text).not.toContain("EXIF");
    expect(text).not.toContain("XMP ");
    expect(text).toContain("VP8 ");
  });
});

describe("stripImageMetadata", () => {
  it("dispatches by format and rejects unsupported ones", () => {
    expect(stripImageMetadata(makeJpeg()).kind).toBe("jpeg");
    expect(stripImageMetadata(makePng()).kind).toBe("png");
    expect(stripImageMetadata(makeWebp()).kind).toBe("webp");
    expect(() => stripImageMetadata(bytes("GIF89a"))).toThrow(/Only JPEG, PNG and WebP/);
  });
});
