/**
 * Lossless image metadata removal for JPEG, PNG and WebP. The pixel data is copied byte-for-byte,
 * so quality never changes. This works on raw bytes and needs no canvas.
 */

export type ImageKind = "jpeg" | "png" | "webp" | "gif" | "bmp" | "unknown";

export function detectImageKind(b: Uint8Array): ImageKind {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (b.length >= 6 && ascii(b, 0, 3) === "GIF") return "gif";
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  return "unknown";
}

function ascii(b: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...b.slice(start, end));
}

export interface RemovedItem {
  name: string;
  bytes: number;
}

export interface StripResult {
  data: Uint8Array;
  removed: RemovedItem[];
  kind: ImageKind;
}

export interface StripOptions {
  /** Keep the ICC colour profile so colours render identically. Default true. */
  keepColorProfile?: boolean;
}

export class ImageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageFormatError";
  }
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

/* ------------------------------ JPEG ------------------------------ */

function jpegSegmentName(marker: number, payload: Uint8Array): string {
  if (marker === 0xfe) return "Comment";
  if (marker === 0xe1) return ascii(payload, 0, 4) === "Exif" ? "EXIF" : "XMP";
  if (marker === 0xe2) return "ICC profile";
  if (marker === 0xed) return "Photoshop / IPTC";
  if (marker === 0xee) return "Adobe";
  return `APP${marker - 0xe0}`;
}

export function stripJpegMetadata(bytes: Uint8Array, options: StripOptions = {}): StripResult {
  const { keepColorProfile = true } = options;
  if (detectImageKind(bytes) !== "jpeg") throw new ImageFormatError("This is not a JPEG file.");
  const kept: Uint8Array[] = [bytes.slice(0, 2)];
  const removed: RemovedItem[] = [];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new ImageFormatError("The JPEG structure is damaged.");
    while (bytes[i + 1] === 0xff) i++; // fill bytes
    const marker = bytes[i + 1] as number;
    if (marker === 0xda) {
      // Start of scan: the rest of the file is entropy-coded data. Copy it verbatim.
      kept.push(bytes.slice(i));
      break;
    }
    if (marker === 0xd9) {
      kept.push(bytes.slice(i, i + 2));
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
      kept.push(bytes.slice(i, i + 2));
      i += 2;
      continue;
    }
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    const segment = bytes.slice(i, i + 2 + length);
    const payload = segment.slice(4);
    const isMetadata =
      marker === 0xfe || (marker >= 0xe1 && marker <= 0xef && marker !== 0xee && !(marker === 0xe2 && keepColorProfile && ascii(payload, 0, 11) === "ICC_PROFILE"));
    if (isMetadata) removed.push({ name: jpegSegmentName(marker, payload), bytes: segment.length });
    else kept.push(segment);
    i += 2 + length;
  }
  return { data: concat(kept), removed, kind: "jpeg" };
}

/* ------------------------------ PNG ------------------------------ */

const PNG_METADATA_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "pHYs", "dSIG", "iDOT"]);

export function stripPngMetadata(bytes: Uint8Array, options: StripOptions = {}): StripResult {
  const { keepColorProfile = true } = options;
  if (detectImageKind(bytes) !== "png") throw new ImageFormatError("This is not a PNG file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.slice(0, 8)];
  const removed: RemovedItem[] = [];
  let i = 8;
  let sawEnd = false;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = ascii(bytes, i + 4, i + 8);
    const total = 12 + length;
    if (i + total > bytes.length) throw new ImageFormatError("The PNG structure is damaged.");
    const chunk = bytes.slice(i, i + total);
    if (PNG_METADATA_CHUNKS.has(type) || (type === "iCCP" && !keepColorProfile)) removed.push({ name: type, bytes: total });
    else kept.push(chunk);
    i += total;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new ImageFormatError("The PNG file is incomplete (no IEND chunk).");
  return { data: concat(kept), removed, kind: "png" };
}

/* ------------------------------ WebP ------------------------------ */

export function stripWebpMetadata(bytes: Uint8Array, options: StripOptions = {}): StripResult {
  const { keepColorProfile = true } = options;
  if (detectImageKind(bytes) !== "webp") throw new ImageFormatError("This is not a WebP file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  const removed: RemovedItem[] = [];
  let removedFlags = 0;
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, i + 4);
    const size = view.getUint32(i + 4, true);
    const padded = size + (size % 2);
    const chunk = bytes.slice(i, i + 8 + padded);
    if (type === "EXIF") {
      removed.push({ name: "EXIF", bytes: chunk.length });
      removedFlags |= 0x08;
    } else if (type === "XMP ") {
      removed.push({ name: "XMP", bytes: chunk.length });
      removedFlags |= 0x04;
    } else if (type === "ICCP" && !keepColorProfile) {
      removed.push({ name: "ICC profile", bytes: chunk.length });
      removedFlags |= 0x20;
    } else {
      chunks.push(chunk);
    }
    i += 8 + padded;
  }
  // Clear the matching feature flags in the VP8X header so decoders don't look for missing chunks.
  const first = chunks[0];
  if (first && ascii(first, 0, 4) === "VP8X") {
    first[8] = (first[8] as number) & ~removedFlags;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.slice(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return { data: concat([header, body]), removed, kind: "webp" };
}

export function stripImageMetadata(bytes: Uint8Array, options: StripOptions = {}): StripResult {
  switch (detectImageKind(bytes)) {
    case "jpeg":
      return stripJpegMetadata(bytes, options);
    case "png":
      return stripPngMetadata(bytes, options);
    case "webp":
      return stripWebpMetadata(bytes, options);
    default:
      throw new ImageFormatError("Only JPEG, PNG and WebP images are supported.");
  }
}
