/**
 * Extract the original embedded image assets from a PDF.
 *
 * Uses pdf-lib to walk page resources and image XObjects. JPEG streams are saved as-is.
 * Lossless FlateDecode images (the way PDF stores "raw" pictures) are turned back into PNG.
 * Other formats are skipped with a readable reason rather than failing the whole job.
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";
import pkg from "@pdf-lib/upng";
import { loadPdf, PdfError } from "./pdf";

const UPNG = ((pkg as unknown as { default: typeof pkg }).default ?? pkg) as {
  encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
};

/** Thrown when the PDF cannot be read or no images could be extracted. */
export class ExtractPdfImagesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractPdfImagesError";
  }
}

export interface ExtractedImage {
  name: string;
  bytes: Uint8Array;
  mime: string;
  extension: string;
  width: number;
  height: number;
}

interface ImageRef {
  ref: PDFRef;
  stream: PDFRawStream | PDFStream;
}

const MB = 1024 * 1024;

/** Files over this are refused before parsing, because everything is held in memory. */
export const EXTRACT_PDF_IMAGES_LIMITS = {
  maxFileBytes: 200 * MB,
} as const;

/** Refuse huge files early so a browser tab does not run out of memory. */
export function checkFileSize(bytes: number): { refuse?: string } {
  if (bytes > EXTRACT_PDF_IMAGES_LIMITS.maxFileBytes) {
    return {
      refuse: `This file is ${Math.round(bytes / MB)} MB. The limit here is ${EXTRACT_PDF_IMAGES_LIMITS.maxFileBytes / MB} MB so a normal browser tab does not run out of memory. Split it first with Split PDF.`,
    };
  }
  return {};
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "asNumber" in value && typeof (value as { asNumber: () => number }).asNumber === "function") {
    return (value as { asNumber: () => number }).asNumber();
  }
  return undefined;
}

function getImageRefs(doc: PDFDocument): ImageRef[] {
  const seen = new Set<string>();
  const refs: ImageRef[] = [];
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const xObjects = resources.lookup(PDFName.of("XObject"), PDFDict);
    if (!xObjects) continue;
    for (const [, value] of xObjects.entries()) {
      if (!(value instanceof PDFRef)) continue;
      const key = `${value.objectNumber}-${value.generationNumber}`;
      if (seen.has(key)) continue;
      const obj = doc.context.lookup(value);
      if (!obj) continue;
      const stream = obj instanceof PDFRawStream || obj instanceof PDFStream ? obj : undefined;
      if (!stream) continue;
      const subtype = stream.dict.get(PDFName.of("Subtype"));
      if (subtype !== PDFName.of("Image")) continue;
      seen.add(key);
      refs.push({ ref: value, stream });
    }
  }
  return refs;
}

function getFilters(stream: PDFRawStream | PDFStream): PDFName[] {
  const filter = stream.dict.get(PDFName.of("Filter"));
  if (!filter) return [];
  if (filter instanceof PDFName) return [filter];
  if (filter instanceof PDFArray) {
    const out: PDFName[] = [];
    for (let i = 0; i < filter.size(); i++) {
      const item = filter.lookup(i);
      if (item instanceof PDFName) out.push(item);
    }
    return out;
  }
  return [];
}

function colorSpaceName(colorSpace: unknown): string | undefined {
  if (colorSpace instanceof PDFName) return colorSpace.asString();
  if (colorSpace instanceof PDFArray && colorSpace.size() > 0) {
    const first = colorSpace.lookup(0);
    if (first instanceof PDFName) return first.asString();
  }
  return undefined;
}

function isSupportedColorSpace(name: string | undefined): boolean {
  return name === "/DeviceRGB" || name === "/DeviceGray";
}

function readJpegInfo(data: Uint8Array): { width: number; height: number } | null {
  const at = (i: number) => data[i] ?? 0;
  if (data.length < 4 || at(0) !== 0xff || at(1) !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= data.length) {
    if (at(i) !== 0xff) {
      i++;
      continue;
    }
    const marker = at(i + 1);
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (at(i + 2) << 8) | at(i + 3);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (i + 10 > data.length) return null;
      return { height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8) };
    }
    i += 2 + length;
  }
  return null;
}

function getRawBytes(stream: PDFRawStream | PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return stream.contents;
  return stream.getContents();
}

function extractJpeg(stream: PDFRawStream | PDFStream): ExtractedImage | null {
  // DCTDecode streams are already JPEG files; pdf-lib cannot decode them (and does not need to).
  const raw = getRawBytes(stream);
  const info = readJpegInfo(raw);
  if (!info) return null;
  return {
    name: "",
    bytes: raw,
    mime: "image/jpeg",
    extension: "jpg",
    width: info.width,
    height: info.height,
  };
}

/**
 * Convert decoded lossless PDF image data to RGBA so it can be passed to UPNG.
 * The data is assumed to be in PDF image order: rows top-to-bottom, pixels left-to-right.
 */
function losslessToRgba(data: Uint8Array, width: number, height: number, colorSpace: string | undefined): Uint8Array | null {
  if (width <= 0 || height <= 0 || width * height > 100_000_000) return null;
  const pixels = width * height;
  const rgba = new Uint8Array(pixels * 4);
  if (colorSpace === "/DeviceRGB") {
    if (data.length < pixels * 3) return null;
    for (let i = 0; i < pixels; i++) {
      rgba[i * 4] = data[i * 3]!;
      rgba[i * 4 + 1] = data[i * 3 + 1]!;
      rgba[i * 4 + 2] = data[i * 3 + 2]!;
      rgba[i * 4 + 3] = 255;
    }
  } else if (colorSpace === "/DeviceGray") {
    if (data.length < pixels) return null;
    for (let i = 0; i < pixels; i++) {
      const g = data[i]!;
      rgba[i * 4] = g;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = g;
      rgba[i * 4 + 3] = 255;
    }
  } else {
    return null;
  }
  return rgba;
}

function extractLosslessPng(stream: PDFRawStream | PDFStream, width: number, height: number, colorSpace: string | undefined): ExtractedImage | null {
  const raw = decodePDFRawStream(stream as PDFRawStream).decode();
  const bitsPerComponent = toNumber(stream.dict.get(PDFName.of("BitsPerComponent"))) ?? 8;
  if (bitsPerComponent !== 8) return null;
  const rgba = losslessToRgba(raw, width, height, colorSpace);
  if (!rgba) return null;
  const encoded = UPNG.encode([rgba.buffer as ArrayBuffer], width, height, 0);
  return {
    name: "",
    bytes: new Uint8Array(encoded),
    mime: "image/png",
    extension: "png",
    width,
    height,
  };
}

type ProcessResult = { kind: "image"; image: Omit<ExtractedImage, "name"> } | { kind: "skipped"; reason: string };

function processImage(stream: PDFRawStream | PDFStream): ProcessResult {
  const width = toNumber(stream.dict.get(PDFName.of("Width")));
  const height = toNumber(stream.dict.get(PDFName.of("Height")));
  if (!width || !height || width <= 0 || height <= 0) {
    return { kind: "skipped", reason: "missing or invalid dimensions" };
  }
  const filters = getFilters(stream);
  const colorSpace = colorSpaceName(stream.dict.get(PDFName.of("ColorSpace")));

  // DCTDecode is a JPEG stored in the PDF.
  if (filters.length === 1 && filters[0] === PDFName.of("DCTDecode")) {
    const image = extractJpeg(stream);
    if (!image) return { kind: "skipped", reason: "JPEG stream could not be read" };
    return { kind: "image", image };
  }

  // FlateDecode (and no other filter) is a lossless image; turn it back into PNG.
  if (filters.length === 1 && filters[0] === PDFName.of("FlateDecode")) {
    if (!isSupportedColorSpace(colorSpace)) {
      return { kind: "skipped", reason: `unsupported color space (${colorSpace ?? "unknown"})` };
    }
    const bitsPerComponent = toNumber(stream.dict.get(PDFName.of("BitsPerComponent"))) ?? 8;
    if (bitsPerComponent !== 8) {
      return { kind: "skipped", reason: `unsupported bit depth (${bitsPerComponent})` };
    }
    const image = extractLosslessPng(stream, width, height, colorSpace);
    if (!image) return { kind: "skipped", reason: "lossless image could not be reconstructed as PNG" };
    return { kind: "image", image };
  }

  // JPXDecode is JPEG 2000; CCITT and JBIG2 are fax-style mono images.
  if (filters.some((f) => f === PDFName.of("JPXDecode"))) {
    return { kind: "skipped", reason: "JPEG 2000 images are not supported" };
  }
  if (filters.some((f) => f === PDFName.of("CCITTFaxDecode") || f === PDFName.of("JBIG2Decode"))) {
    return { kind: "skipped", reason: "CCITT and JBIG2 fax images are not supported" };
  }
  if (filters.length === 0) {
    return { kind: "skipped", reason: "uncompressed images are not supported" };
  }
  return { kind: "skipped", reason: `unsupported filters (${filters.map((f) => f.asString()).join(", ")})` };
}

/**
 * Extract the embedded image assets from a PDF.
 * Returns one entry per unique image object; images reused across pages are deduplicated.
 * JPEGs are returned as-is; lossless images are returned as PNG.
 */
export async function extractPdfImages(bytes: Uint8Array): Promise<ExtractedImage[]> {
  const sizeCheck = checkFileSize(bytes.length);
  if (sizeCheck.refuse) throw new ExtractPdfImagesError(sizeCheck.refuse);

  let doc: PDFDocument;
  try {
    doc = await loadPdf(bytes);
  } catch (err) {
    if (err instanceof PdfError) throw new ExtractPdfImagesError(err.message);
    throw new ExtractPdfImagesError("The PDF could not be read. It may be corrupted or not a PDF.");
  }

  const refs = getImageRefs(doc);
  if (refs.length === 0) {
    throw new ExtractPdfImagesError("This PDF has no embedded images.");
  }

  const images: ExtractedImage[] = [];
  const skipped: string[] = [];
  for (const { stream } of refs) {
    const result = processImage(stream);
    if (result.kind === "skipped") {
      skipped.push(result.reason);
      continue;
    }
    const index = images.length + 1;
    images.push({
      ...result.image,
      name: `image-${String(index).padStart(3, "0")}.${result.image.extension}`,
    });
  }

  if (images.length === 0) {
    const reasons = [...new Set(skipped)].slice(0, 3).join("; ");
    throw new ExtractPdfImagesError(`No images could be extracted. ${reasons ? `Reasons: ${reasons}.` : ""}`);
  }

  return images;
}
