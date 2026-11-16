/**
 * Reading PDF streams and content: decoding filters (with PNG and TIFF predictors), and a tokenizer for content
 * streams that keeps each token's place, so a tool can rewrite some operators and copy the rest exactly.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFStream, decodePDFRawStream } from "pdf-lib";

const nameOf = (o: unknown) => (o instanceof PDFName ? o.decodeText() : undefined);
const num = (o: unknown, fallback = 0) => (o instanceof PDFNumber ? o.asNumber() : fallback);

/* ----------------------------------------------------------------------------------------------- */
/* Streams                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

export const FILTER_ALIASES: Record<string, string> = { AHx: "ASCIIHexDecode", A85: "ASCII85Decode", LZW: "LZWDecode", Fl: "FlateDecode", RL: "RunLengthDecode", CCF: "CCITTFaxDecode", DCT: "DCTDecode" };

export function filtersOf(dict: PDFDict): { names: string[]; parms: (PDFDict | undefined)[] } {
  const f = dict.lookup(PDFName.of("Filter"));
  const p = dict.lookup(PDFName.of("DecodeParms"));
  const names = f instanceof PDFName ? [f.decodeText()] : f instanceof PDFArray ? f.asArray().map((x) => nameOf(x) ?? "") : [];
  const parms = p instanceof PDFDict ? [p] : p instanceof PDFArray ? p.asArray().map((x) => (x instanceof PDFDict ? x : undefined)) : [];
  return { names: names.map((n) => FILTER_ALIASES[n] ?? n), parms };
}

/** Undoes a PNG or TIFF predictor (DecodeParms /Predictor). */
export function unpredict(data: Uint8Array, parms: PDFDict | undefined): Uint8Array {
  const predictor = num(parms?.lookup(PDFName.of("Predictor")), 1);
  if (predictor <= 1) return data;
  const colors = num(parms?.lookup(PDFName.of("Colors")), 1);
  const bpc = num(parms?.lookup(PDFName.of("BitsPerComponent")), 8);
  const columns = num(parms?.lookup(PDFName.of("Columns")), 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowBytes = Math.ceil((colors * bpc * columns) / 8);
  if (predictor === 2) {
    if (bpc !== 8) return data;
    const out = data.slice();
    for (let row = 0; row + rowBytes <= out.length; row += rowBytes) for (let i = bpp; i < rowBytes; i++) out[row + i] = ((out[row + i] as number) + (out[row + i - bpp] as number)) & 255;
    return out;
  }
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowBytes + 1)] as number;
    const src = r * (rowBytes + 1) + 1;
    const dst = r * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i] as number;
      const left = i >= bpp ? (out[dst + i - bpp] as number) : 0;
      const up = r > 0 ? (out[dst - rowBytes + i] as number) : 0;
      const upLeft = r > 0 && i >= bpp ? (out[dst - rowBytes + i - bpp] as number) : 0;
      let v = x;
      if (type === 1) v = x + left;
      else if (type === 2) v = x + up;
      else if (type === 3) v = x + ((left + up) >> 1);
      else if (type === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        v = x + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      out[dst + i] = v & 255;
    }
  }
  return out;
}

/**
 * The decoded bytes of a stream, applying every filter up to (not including) the first one listed in `stopAt`.
 * Returns null for a filter this cannot undo.
 */
export function decodeStream(stream: PDFStream, stopAt: readonly string[] = []): Uint8Array | null {
  if (!(stream instanceof PDFRawStream)) {
    try {
      return stream.getContents();
    } catch {
      return null;
    }
  }
  const { names, parms } = filtersOf(stream.dict);
  const stop = names.findIndex((n) => stopAt.includes(n));
  const used = stop === -1 ? names : names.slice(0, stop);
  if (used.some((n) => !["FlateDecode", "LZWDecode", "ASCII85Decode", "ASCIIHexDecode", "RunLengthDecode"].includes(n))) return null;
  try {
    let data: Uint8Array;
    if (used.length === 0) data = stream.contents;
    else {
      const dict = stream.dict.context.obj({}) as PDFDict;
      dict.set(PDFName.of("Filter"), stream.dict.context.obj(used.map((n) => PDFName.of(n))));
      data = decodePDFRawStream(PDFRawStream.of(dict, stream.contents)).decode();
    }
    // A predictor belongs to the Flate or LZW step; apply the last one used.
    for (let i = used.length - 1; i >= 0; i--) {
      if (used[i] === "FlateDecode" || used[i] === "LZWDecode") {
        data = unpredict(data, parms[i]);
        break;
      }
    }
    return data;
  } catch {
    return null;
  }
}

export const latin1 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
};
export const toBytes = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
};

/* ----------------------------------------------------------------------------------------------- */
/* Content tokens                                                                                   */
/* ----------------------------------------------------------------------------------------------- */

export interface Token {
  kind: "num" | "name" | "str" | "array" | "dict" | "op";
  text: string;
  start: number;
  end: number;
  value?: number;
}

const WS = new Set([32, 10, 13, 9, 12, 0]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

/** Reads the token at `i` (after spaces and comments), or null at the end. */
export function readToken(s: string, from: number): Token | null {
  let i = from;
  const n = s.length;
  for (;;) {
    while (i < n && WS.has(s.charCodeAt(i))) i++;
    if (i < n && s.charCodeAt(i) === 37) {
      while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++;
      continue;
    }
    break;
  }
  if (i >= n) return null;
  const start = i;
  const c = s.charCodeAt(i);
  if (c === 40) {
    let depth = 1;
    i++;
    while (i < n && depth > 0) {
      const d = s.charCodeAt(i);
      if (d === 92) i++;
      else if (d === 40) depth++;
      else if (d === 41) depth--;
      i++;
    }
    return { kind: "str", text: s.slice(start, i), start, end: i };
  }
  if (c === 60 && s.charCodeAt(i + 1) !== 60) {
    while (i < n && s.charCodeAt(i) !== 62) i++;
    return { kind: "str", text: s.slice(start, i + 1), start, end: i + 1 };
  }
  if (c === 91 || (c === 60 && s.charCodeAt(i + 1) === 60)) {
    const dict = c === 60;
    i += dict ? 2 : 1;
    for (;;) {
      while (i < n && WS.has(s.charCodeAt(i))) i++;
      if (i >= n) break;
      if (!dict && s.charCodeAt(i) === 93) {
        i++;
        break;
      }
      if (dict && s.charCodeAt(i) === 62 && s.charCodeAt(i + 1) === 62) {
        i += 2;
        break;
      }
      const inner = readToken(s, i);
      if (!inner) break;
      i = inner.end;
    }
    return { kind: dict ? "dict" : "array", text: s.slice(start, i), start, end: i };
  }
  if (c === 47) {
    i++;
    while (i < n && !WS.has(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++;
    return { kind: "name", text: s.slice(start + 1, i), start, end: i };
  }
  if (DELIM.has(c)) return { kind: "op", text: s[i] as string, start, end: i + 1 };
  while (i < n && !WS.has(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++;
  const text = s.slice(start, i);
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return { kind: "num", text, start, end: i, value: Number(text) };
  return { kind: "op", text, start, end: i };
}

/** Decodes a name written with #xx escapes. */
export const unescapeName = (name: string) => name.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
