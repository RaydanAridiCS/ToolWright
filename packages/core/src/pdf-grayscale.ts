/**
 * Grayscale PDF: turns every colour in a PDF to a shade of gray (or to pure black and white) while text and
 * drawings stay sharp, selectable vectors.
 *
 * - Colour operators in page content, forms, patterns, Type 3 glyphs and annotation appearances are rewritten
 *   (`rg`, `k`, `sc`, `scn` and colour-space changes become DeviceGray), with spot colours (Separation, DeviceN)
 *   converted through their own tint functions, which are evaluated here (function types 0, 2, 3 and 4).
 * - Pictures are decoded and stored again in gray. Palette pictures only get a gray palette. JPEGs need a codec from
 *   the caller (the browser's canvas); without one they are left as they are and counted.
 * - Smooth shadings (gradients) get a sampled gray function in place of their colour one.
 *
 * Anything that cannot be converted is left as it was and counted, so the report says what kept its colour.
 */
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream, type PDFObject } from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";

export type GrayMode = "gray" | "bw";

/** JPEG decoding and encoding, which only the browser can do (canvas). */
export interface GrayImageCodec {
  /** RGBA pixels of a JPEG, or null when it cannot be read. */
  decodeJpeg(data: Uint8Array): Promise<{ data: Uint8ClampedArray | Uint8Array; width: number; height: number } | null>;
  /** A JPEG of RGBA pixels at a quality from 0 to 1, or null. */
  encodeJpeg(rgba: Uint8ClampedArray, width: number, height: number, quality: number): Promise<Uint8Array | null>;
}

export interface GrayscaleOptions {
  /** Shades of gray (default), or pure black and white. */
  mode?: GrayMode;
  /** For black and white: the lightness from 0 to 1 at or above which a colour becomes white. 0.5 by default. */
  threshold?: number;
  codec?: GrayImageCodec;
  /** JPEG quality for photos saved again, 0 to 1. */
  jpegQuality?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface GrayscaleReport {
  /** Colour settings changed in content (operators, annotation colours). */
  colors: number;
  images: number;
  shadings: number;
  /** Things that keep their colour, by reason. */
  kept: { jpeg: number; jpeg2000: number; mesh: number; other: number };
}

export interface GrayscaleResult extends GrayscaleReport {
  data: Uint8Array;
}

/* ----------------------------------------------------------------------------------------------- */
/* Colour spaces and conversion                                                                     */
/* ----------------------------------------------------------------------------------------------- */

type Fn = (input: number[]) => number[];

export type Space =
  | { t: "gray" }
  | { t: "rgb" }
  | { t: "cmyk" }
  | { t: "lab" }
  | { t: "indexed"; base: Space; hival: number; lookup: Uint8Array }
  | { t: "sep"; n: number; alt: Space; fn: Fn | null; all: boolean; none: boolean }
  | { t: "pattern"; under: Space | null }
  | { t: "unknown" };

const GRAY: Space = { t: "gray" };

export function componentsOf(space: Space): number {
  switch (space.t) {
    case "gray":
    case "indexed":
      return 1;
    case "rgb":
    case "lab":
      return 3;
    case "cmyk":
      return 4;
    case "sep":
      return space.n;
    default:
      return 0;
  }
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Lightness of a colour from 0 (black) to 1 (white), the way the PDF standard turns RGB and CMYK into gray. */
export function toGray(space: Space, c: readonly number[]): number | null {
  const at = (i: number) => c[i] ?? 0;
  switch (space.t) {
    case "gray":
      return clamp01(at(0));
    case "rgb":
      return clamp01(0.3 * at(0) + 0.59 * at(1) + 0.11 * at(2));
    case "cmyk":
      return clamp01(1 - Math.min(1, 0.3 * at(0) + 0.59 * at(1) + 0.11 * at(2) + at(3)));
    case "lab":
      return clamp01(at(0) / 100);
    case "indexed": {
      const n = componentsOf(space.base);
      const index = Math.min(Math.max(Math.round(at(0)), 0), space.hival);
      const base = Array.from({ length: n }, (_, k) => (space.lookup[index * n + k] ?? 0) / 255);
      if (space.base.t === "lab") base[0] = (base[0] ?? 0) * 100;
      return toGray(space.base, base);
    }
    case "sep":
      if (space.none) return null;
      if (space.all) return clamp01(1 - at(0));
      if (!space.fn) return null;
      return toGray(space.alt, space.fn(c.slice(0, space.n)));
    default:
      return null;
  }
}

/** Components in `space` that show the gray `v`, for spaces that cannot be swapped (an uncoloured pattern's own). */
function sameSpaceGray(space: Space, v: number): number[] | null {
  switch (space.t) {
    case "gray":
      return [v];
    case "rgb":
      return [v, v, v];
    case "cmyk":
      return [0, 0, 0, 1 - v];
    case "lab":
      return [v * 100, 0, 0];
    default:
      return null;
  }
}

const convertible = (s: Space) => s.t === "gray" || s.t === "rgb" || s.t === "cmyk" || s.t === "lab" || s.t === "indexed" || (s.t === "sep" && !s.none && (s.all || s.fn !== null));

const nameOf = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);
const num = (o: PDFObject | undefined, fallback = 0) => (o instanceof PDFNumber ? o.asNumber() : fallback);
const numbers = (o: PDFObject | undefined): number[] | undefined => (o instanceof PDFArray ? o.asArray().map((x) => num(x, NaN)) : undefined);

/* ----------------------------------------------------------------------------------------------- */
/* Streams                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

const FILTER_ALIASES: Record<string, string> = { AHx: "ASCIIHexDecode", A85: "ASCII85Decode", LZW: "LZWDecode", Fl: "FlateDecode", RL: "RunLengthDecode", CCF: "CCITTFaxDecode", DCT: "DCTDecode" };

function filtersOf(dict: PDFDict): { names: string[]; parms: (PDFDict | undefined)[] } {
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
function decodeStream(stream: PDFStream, stopAt: readonly string[] = []): Uint8Array | null {
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

const latin1 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
};
const toBytes = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
};

/* ----------------------------------------------------------------------------------------------- */
/* Functions (types 0, 2, 3, 4)                                                                     */
/* ----------------------------------------------------------------------------------------------- */

const clip = (v: number, lo: number | undefined, hi: number | undefined) => (lo === undefined || hi === undefined ? v : Math.min(hi, Math.max(lo, v)));

export function compileFunction(obj: PDFObject | undefined, depth = 0): Fn | null {
  if (!obj || depth > 8) return null;
  if (obj instanceof PDFArray) {
    const parts = obj.asArray().map((_, i) => compileFunction(obj.lookup(i), depth + 1));
    if (parts.some((p) => !p)) return null;
    return (x) => parts.flatMap((p) => (p as Fn)(x));
  }
  const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
  if (!dict) return null;
  const type = num(dict.lookup(PDFName.of("FunctionType")), -1);
  const domain = numbers(dict.lookup(PDFName.of("Domain"))) ?? [0, 1];
  const range = numbers(dict.lookup(PDFName.of("Range")));
  const finish = (out: number[]) => (range ? out.map((v, j) => clip(v, range[2 * j], range[2 * j + 1])) : out);
  const clipIn = (x: number[]) => x.map((v, i) => clip(v, domain[2 * i], domain[2 * i + 1]));

  if (type === 2) {
    const c0 = numbers(dict.lookup(PDFName.of("C0"))) ?? [0];
    const c1 = numbers(dict.lookup(PDFName.of("C1"))) ?? [1];
    const n = num(dict.lookup(PDFName.of("N")), 1);
    return (input) => {
      const x = clipIn(input)[0] ?? 0;
      const p = x ** n;
      return finish(c0.map((a, j) => a + p * ((c1[j] ?? 0) - a)));
    };
  }
  if (type === 3) {
    const fns = dict.lookup(PDFName.of("Functions"));
    const parts = fns instanceof PDFArray ? fns.asArray().map((o) => compileFunction(o instanceof PDFRef ? dict.context.lookup(o) : o, depth + 1)) : [];
    if (parts.length === 0 || parts.some((p) => !p)) return null;
    const bounds = numbers(dict.lookup(PDFName.of("Bounds"))) ?? [];
    const encode = numbers(dict.lookup(PDFName.of("Encode"))) ?? parts.flatMap(() => [0, 1]);
    return (input) => {
      const x = clipIn(input)[0] ?? 0;
      let k = 0;
      while (k < bounds.length && x >= (bounds[k] as number)) k++;
      const lo = k === 0 ? (domain[0] as number) : (bounds[k - 1] as number);
      const hi = k === bounds.length ? (domain[1] as number) : (bounds[k] as number);
      const e0 = encode[2 * k] ?? 0;
      const e1 = encode[2 * k + 1] ?? 1;
      const t = hi === lo ? e0 : e0 + ((x - lo) * (e1 - e0)) / (hi - lo);
      return finish((parts[k] as Fn)([t]));
    };
  }
  if (type === 0 && obj instanceof PDFStream) {
    const data = decodeStream(obj);
    const size = numbers(dict.lookup(PDFName.of("Size")));
    const bps = num(dict.lookup(PDFName.of("BitsPerSample")), 8);
    if (!data || !size || !range || ![1, 2, 4, 8, 12, 16, 24, 32].includes(bps)) return null;
    const m = size.length;
    const n = range.length / 2;
    const encode = numbers(dict.lookup(PDFName.of("Encode"))) ?? size.flatMap((s) => [0, s - 1]);
    const decode = numbers(dict.lookup(PDFName.of("Decode"))) ?? range;
    const max = 2 ** bps - 1;
    const sample = (index: number) => {
      // Reads sample `index` (0-based over every output of every grid point).
      let v = 0;
      const bit = index * bps;
      for (let b = 0; b < bps; b++) {
        const at = bit + b;
        v = v * 2 + (((data[at >> 3] ?? 0) >> (7 - (at & 7))) & 1);
      }
      return v;
    };
    return (input) => {
      const x = clipIn(input);
      const e = x.map((v, i) => {
        const d0 = domain[2 * i] as number;
        const d1 = domain[2 * i + 1] as number;
        const enc = (encode[2 * i] ?? 0) + ((v - d0) * ((encode[2 * i + 1] ?? 0) - (encode[2 * i] ?? 0))) / (d1 - d0 || 1);
        return Math.min(Math.max(enc, 0), (size[i] as number) - 1);
      });
      // Multilinear interpolation over the 2^m corners round the point.
      const out = new Array<number>(n).fill(0);
      for (let corner = 0; corner < 1 << m; corner++) {
        let weight = 1;
        let offset = 0;
        let stride = 1;
        for (let i = 0; i < m; i++) {
          const lo = Math.floor(e[i] as number);
          const frac = (e[i] as number) - lo;
          const up = (corner >> i) & 1;
          const at = Math.min(lo + up, (size[i] as number) - 1);
          weight *= up ? frac : 1 - frac;
          offset += at * stride;
          stride *= size[i] as number;
        }
        if (weight === 0) continue;
        for (let j = 0; j < n; j++) out[j] = (out[j] as number) + weight * sample(offset * n + j);
      }
      return finish(out.map((s, j) => (decode[2 * j] ?? 0) + (s * ((decode[2 * j + 1] ?? 1) - (decode[2 * j] ?? 0))) / max));
    };
  }
  if (type === 4 && obj instanceof PDFStream) {
    const data = decodeStream(obj);
    if (!data) return null;
    const program = parsePostScript(latin1(data));
    if (!program) return null;
    return (input) => {
      const stack: (number | boolean)[] = clipIn(input).slice();
      runPostScript(program, stack);
      const n = range ? range.length / 2 : stack.length;
      return finish(stack.slice(-n).map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v)));
    };
  }
  return null;
}

type PsItem = number | boolean | string | PsItem[];

function parsePostScript(text: string): PsItem[] | null {
  const tokens = text.match(/\{|\}|[^\s{}]+/g) ?? [];
  let i = 0;
  const block = (): PsItem[] | null => {
    const out: PsItem[] = [];
    while (i < tokens.length) {
      const t = tokens[i++] as string;
      if (t === "{") {
        const inner = block();
        if (!inner) return null;
        out.push(inner);
      } else if (t === "}") return out;
      else if (t === "true" || t === "false") out.push(t === "true");
      else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) out.push(Number(t));
      else out.push(t);
    }
    return out;
  };
  if (tokens[i++] !== "{") return null;
  return block();
}

function runPostScript(program: PsItem[], stack: (number | boolean)[], depth = 0): void {
  if (depth > 32) return;
  const pop = () => stack.pop() ?? 0;
  const popN = () => Number(pop());
  for (let k = 0; k < program.length; k++) {
    const op = program[k] as PsItem;
    if (typeof op === "number" || typeof op === "boolean") {
      stack.push(op);
      continue;
    }
    if (Array.isArray(op)) {
      // A procedure is only ever an operand of if or ifelse.
      const next = program[k + 1];
      if (next === "if") {
        const cond = pop();
        if (cond) runPostScript(op, stack, depth + 1);
        k++;
      } else if (Array.isArray(next) && program[k + 2] === "ifelse") {
        const cond = pop();
        runPostScript(cond ? op : next, stack, depth + 1);
        k += 2;
      }
      continue;
    }
    const b = () => popN();
    switch (op) {
      case "add": { const y = b(); stack.push(b() + y); break; }
      case "sub": { const y = b(); stack.push(b() - y); break; }
      case "mul": { const y = b(); stack.push(b() * y); break; }
      case "div": { const y = b(); const x = b(); stack.push(y === 0 ? 0 : x / y); break; }
      case "idiv": { const y = b(); const x = b(); stack.push(y === 0 ? 0 : Math.trunc(x / y)); break; }
      case "mod": { const y = b(); const x = b(); stack.push(y === 0 ? 0 : x % y); break; }
      case "neg": stack.push(-b()); break;
      case "abs": stack.push(Math.abs(b())); break;
      case "ceiling": stack.push(Math.ceil(b())); break;
      case "floor": stack.push(Math.floor(b())); break;
      case "round": stack.push(Math.round(b())); break;
      case "truncate": case "cvi": stack.push(Math.trunc(b())); break;
      case "cvr": break;
      case "sqrt": stack.push(Math.sqrt(Math.max(0, b()))); break;
      case "sin": stack.push(Math.sin((b() * Math.PI) / 180)); break;
      case "cos": stack.push(Math.cos((b() * Math.PI) / 180)); break;
      case "atan": { const den = b(); const numr = b(); let a = (Math.atan2(numr, den) * 180) / Math.PI; if (a < 0) a += 360; stack.push(a); break; }
      case "exp": { const e = b(); stack.push(b() ** e); break; }
      case "ln": stack.push(Math.log(b())); break;
      case "log": stack.push(Math.log10(b())); break;
      case "eq": { const y = pop(); stack.push(pop() === y); break; }
      case "ne": { const y = pop(); stack.push(pop() !== y); break; }
      case "gt": { const y = b(); stack.push(b() > y); break; }
      case "ge": { const y = b(); stack.push(b() >= y); break; }
      case "lt": { const y = b(); stack.push(b() < y); break; }
      case "le": { const y = b(); stack.push(b() <= y); break; }
      case "and": { const y = pop(); const x = pop(); stack.push(typeof x === "boolean" ? x && !!y : Number(x) & Number(y)); break; }
      case "or": { const y = pop(); const x = pop(); stack.push(typeof x === "boolean" ? x || !!y : Number(x) | Number(y)); break; }
      case "xor": { const y = pop(); const x = pop(); stack.push(typeof x === "boolean" ? x !== !!y : Number(x) ^ Number(y)); break; }
      case "not": { const x = pop(); stack.push(typeof x === "boolean" ? !x : ~Number(x)); break; }
      case "bitshift": { const s = b(); const x = b(); stack.push(s >= 0 ? x << s : x >> -s); break; }
      case "true": stack.push(true); break;
      case "false": stack.push(false); break;
      case "pop": pop(); break;
      case "exch": { const y = pop(); const x = pop(); stack.push(y, x); break; }
      case "dup": { const x = pop(); stack.push(x, x); break; }
      case "copy": { const n = b(); stack.push(...stack.slice(stack.length - n)); break; }
      case "index": { const n = b(); stack.push(stack[stack.length - 1 - n] ?? 0); break; }
      case "roll": {
        const j = b();
        const n = b();
        if (n > 0 && n <= stack.length) {
          const part = stack.splice(stack.length - n, n);
          const shift = ((j % n) + n) % n;
          stack.push(...part.slice(n - shift), ...part.slice(0, n - shift));
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ----------------------------------------------------------------------------------------------- */
/* The converter                                                                                    */
/* ----------------------------------------------------------------------------------------------- */

const fmt = (v: number) => {
  const r = Math.round(v * 10000) / 10000;
  return String(r);
};

interface Token {
  kind: "num" | "name" | "str" | "array" | "dict" | "op";
  text: string;
  start: number;
  end: number;
  value?: number;
}

const WS = new Set([32, 10, 13, 9, 12, 0]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

/** Reads the token at `i` (after spaces and comments), or null at the end. */
function readToken(s: string, from: number): Token | null {
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
const unescapeName = (name: string) => name.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

class Converter {
  readonly report: GrayscaleReport = { colors: 0, images: 0, shadings: 0, kept: { jpeg: 0, jpeg2000: 0, mesh: 0, other: 0 } };
  private readonly done = new Set<string>();
  private readonly spaces = new WeakMap<object, Space>();
  private readonly jpegs: { ref: PDFRef; stream: PDFRawStream; space: Space }[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly mode: GrayMode,
    private readonly threshold: number,
  ) {}

  /** The final shade: as is, or snapped to black or white. */
  shade(v: number): number {
    return this.mode === "bw" ? (v >= this.threshold ? 1 : 0) : v;
  }

  private once(ref: PDFObject | undefined): boolean {
    if (!(ref instanceof PDFRef)) return true;
    const key = ref.toString();
    if (this.done.has(key)) return false;
    this.done.add(key);
    return true;
  }

  private lookup(o: PDFObject | undefined): PDFObject | undefined {
    return o instanceof PDFRef ? this.doc.context.lookup(o) : o;
  }

  /* -- colour spaces -- */

  resolveSpace(obj: PDFObject | undefined, resources?: PDFDict, depth = 0): Space {
    if (depth > 8) return { t: "unknown" };
    const o = this.lookup(obj);
    if (!o) return { t: "unknown" };
    if (typeof o === "object" && this.spaces.has(o)) return this.spaces.get(o) as Space;
    let space: Space = { t: "unknown" };
    if (o instanceof PDFName) {
      const name = o.decodeText();
      const device: Record<string, Space> = { DeviceGray: GRAY, G: GRAY, CalGray: GRAY, DeviceRGB: { t: "rgb" }, RGB: { t: "rgb" }, CalRGB: { t: "rgb" }, DeviceCMYK: { t: "cmyk" }, CMYK: { t: "cmyk" }, Pattern: { t: "pattern", under: null } };
      if (device[name]) return device[name] as Space;
      const named = resources?.lookupMaybe(PDFName.of("ColorSpace"), PDFDict)?.get(PDFName.of(name));
      return named ? this.resolveSpace(named, resources, depth + 1) : { t: "unknown" };
    }
    if (o instanceof PDFArray) {
      const family = nameOf(this.lookup(o.get(0)));
      const arg = (i: number) => this.lookup(o.get(i));
      switch (family) {
        case "DeviceGray":
        case "CalGray":
        case "G":
          space = GRAY;
          break;
        case "DeviceRGB":
        case "CalRGB":
        case "RGB":
          space = { t: "rgb" };
          break;
        case "DeviceCMYK":
        case "CMYK":
          space = { t: "cmyk" };
          break;
        case "Lab":
          space = { t: "lab" };
          break;
        case "ICCBased": {
          const stream = arg(1);
          const dict = stream instanceof PDFStream ? stream.dict : undefined;
          const n = num(dict?.lookup(PDFName.of("N")), 0);
          const alt = dict?.get(PDFName.of("Alternate"));
          space = n === 1 ? GRAY : n === 3 ? { t: "rgb" } : n === 4 ? { t: "cmyk" } : alt ? this.resolveSpace(alt, resources, depth + 1) : { t: "unknown" };
          break;
        }
        case "Indexed":
        case "I": {
          const base = this.resolveSpace(o.get(1), resources, depth + 1);
          const hival = num(arg(2));
          const table = arg(3);
          const lookup = table instanceof PDFString || table instanceof PDFHexString ? table.asBytes() : table instanceof PDFStream ? decodeStream(table) : null;
          space = lookup && componentsOf(base) > 0 ? { t: "indexed", base, hival, lookup } : { t: "unknown" };
          break;
        }
        case "Separation":
        case "DeviceN": {
          const names = arg(1);
          const list = names instanceof PDFName ? [names.decodeText()] : names instanceof PDFArray ? names.asArray().map((x) => nameOf(this.lookup(x)) ?? "") : [];
          const alt = this.resolveSpace(o.get(2), resources, depth + 1);
          const fn = compileFunction(arg(3));
          space = { t: "sep", n: list.length || 1, alt, fn, all: list.length === 1 && list[0] === "All", none: list.every((x) => x === "None") };
          break;
        }
        case "Pattern":
          space = { t: "pattern", under: o.size() > 1 ? this.resolveSpace(o.get(1), resources, depth + 1) : null };
          break;
        default:
          space = { t: "unknown" };
      }
    }
    this.spaces.set(o, space);
    return space;
  }

  /* -- content streams -- */

  /** Rewrites the colour operators of a content stream. Returns null when nothing changed. */
  rewrite(s: string, resources: PDFDict | undefined): string | null {
    const out: string[] = [];
    let emitted = 0;
    let operands: Token[] = [];
    let state = { fill: GRAY as Space, stroke: GRAY as Space };
    const stack: (typeof state)[] = [];
    let changed = false;
    const replace = (from: number, to: number, text: string) => {
      out.push(s.slice(emitted, from), text);
      emitted = to;
      changed = true;
      this.report.colors++;
    };
    let i = 0;
    for (;;) {
      const t = readToken(s, i);
      if (!t) break;
      i = t.end;
      if (t.kind !== "op" || t.text === "true" || t.text === "false" || t.text === "null") {
        operands.push(t);
        continue;
      }
      const op = t.text;
      const segStart = operands[0]?.start ?? t.start;
      const nums = operands.filter((x) => x.kind === "num").map((x) => x.value as number);
      const stroke = op === op.toUpperCase() && op !== "BI";
      switch (op) {
        case "q":
          stack.push({ ...state });
          break;
        case "Q":
          state = stack.pop() ?? state;
          break;
        case "g":
        case "G": {
          if (stroke) state.stroke = GRAY;
          else state.fill = GRAY;
          if (this.mode === "bw" && nums.length === 1) {
            const v = this.shade(nums[0] as number);
            if (v !== nums[0]) replace(segStart, t.end, `${fmt(v)} ${op}`);
          }
          break;
        }
        case "rg":
        case "RG":
        case "k":
        case "K": {
          const space: Space = op.toLowerCase() === "rg" ? { t: "rgb" } : { t: "cmyk" };
          const v = toGray(space, nums);
          if (stroke) state.stroke = GRAY;
          else state.fill = GRAY;
          if (v !== null) replace(segStart, t.end, `${fmt(this.shade(v))} ${stroke ? "G" : "g"}`);
          break;
        }
        case "cs":
        case "CS": {
          const name = operands[operands.length - 1];
          const space = name?.kind === "name" ? this.resolveSpace(PDFName.of(unescapeName(name.text)), resources) : ({ t: "unknown" } as Space);
          if (stroke) state.stroke = space;
          else state.fill = space;
          if (space.t !== "gray" && convertible(space)) replace(segStart, t.end, `/DeviceGray ${op}`);
          break;
        }
        case "sc":
        case "scn":
        case "SC":
        case "SCN": {
          const space = stroke ? state.stroke : state.fill;
          const last = operands[operands.length - 1];
          if (space.t === "pattern") {
            // An uncoloured pattern's colour is given in its own space, which stays; give it a gray in that space.
            if (last?.kind === "name" && nums.length > 0 && space.under) {
              const v = toGray(space.under, nums);
              const same = v === null ? null : sameSpaceGray(space.under, this.shade(v));
              if (same) replace(segStart, last.start, `${same.map(fmt).join(" ")} `);
            }
            break;
          }
          if (!convertible(space) || nums.length === 0) break;
          const v = toGray(space, nums);
          if (v === null) break;
          if (space.t === "gray" && this.shade(v) === nums[0]) break;
          replace(segStart, t.end, `${fmt(this.shade(v))} ${op}`);
          break;
        }
        case "BI": {
          const end = this.inlineImage(s, t.end, resources);
          if (!end) return changed ? out.join("") + s.slice(emitted) : null;
          if (end.text !== null) {
            out.push(s.slice(emitted, t.start), end.text);
            emitted = end.end;
            changed = true;
          }
          i = end.end;
          break;
        }
        default:
          break;
      }
      operands = [];
    }
    if (!changed) return null;
    out.push(s.slice(emitted));
    return out.join("");
  }

  /** Reads an inline image starting after `BI`; returns where it ends and, when converted, its replacement. */
  private inlineImage(s: string, from: number, resources: PDFDict | undefined): { end: number; text: string | null } | null {
    const entries = new Map<string, Token>();
    let i = from;
    let key: string | null = null;
    for (;;) {
      const t = readToken(s, i);
      if (!t) return null;
      i = t.end;
      if (t.kind === "op" && t.text === "ID") break;
      if (key === null && t.kind === "name") key = t.text;
      else if (key !== null) {
        entries.set(key, t);
        key = null;
      }
    }
    const dataStart = i + 1;
    const get = (...names: string[]) => names.map((n) => entries.get(n)).find(Boolean);
    const filter = get("F", "Filter");
    const filterName = filter?.kind === "name" ? (FILTER_ALIASES[filter.text] ?? filter.text) : filter ? "complex" : null;
    const w = get("W", "Width")?.value ?? 0;
    const h = get("H", "Height")?.value ?? 0;
    const mask = get("IM", "ImageMask")?.text === "true";
    const bpc = mask ? 1 : (get("BPC", "BitsPerComponent")?.value ?? 8);
    const csToken = get("CS", "ColorSpace");
    let space: Space = GRAY;
    if (csToken?.kind === "name") space = this.resolveSpace(PDFName.of(unescapeName(csToken.text)), resources);
    else if (csToken?.kind === "array") space = this.inlineArraySpace(csToken.text, resources);
    const comps = componentsOf(space);
    const rowBytes = Math.ceil((w * comps * bpc) / 8);

    // Find the end of the data.
    let dataEnd: number;
    if (filterName === null && comps > 0 && w > 0 && h > 0) dataEnd = dataStart + rowBytes * h;
    else if (filterName === "ASCIIHexDecode") dataEnd = s.indexOf(">", dataStart) + 1;
    else {
      const ei = /\sEI(?=\s|$)/g;
      ei.lastIndex = dataStart;
      const found = ei.exec(s);
      if (!found) return null;
      dataEnd = found.index;
    }
    const eiAt = /EI(?=\s|$)/g;
    eiAt.lastIndex = dataEnd;
    const ei = eiAt.exec(s);
    if (!ei || dataEnd <= 0) return null;
    const end = ei.index + 2;
    // Masks take the fill colour, and gray pictures are already gray (black and white still snaps them).
    if (mask || (space.t === "gray" && this.mode === "gray")) return { end, text: null };
    if (!convertible(space) || ![1, 2, 4, 8].includes(bpc) || w <= 0 || h <= 0 || get("DP", "DecodeParms") || get("D", "Decode")) {
      if (space.t !== "gray") this.report.kept.other++;
      return { end, text: null };
    }
    let raw: Uint8Array | null = null;
    const body = s.slice(dataStart, dataEnd);
    try {
      if (filterName === null) raw = toBytes(body);
      else if (filterName === "ASCIIHexDecode" || filterName === "FlateDecode") {
        const dict = this.doc.context.obj({ Filter: filterName }) as PDFDict;
        raw = decodePDFRawStream(PDFRawStream.of(dict, toBytes(body))).decode();
      }
    } catch {
      raw = null;
    }
    if (!raw || raw.length < rowBytes * h) {
      this.report.kept.other++;
      return { end, text: null };
    }
    const gray = this.pixelsToGray(raw, w, h, space, bpc, undefined);
    const { data, bits } = this.packGray(gray, w, h);
    let hex = "";
    for (const b of data) hex += (b < 16 ? "0" : "") + b.toString(16);
    this.report.images++;
    this.report.colors++;
    const interpolate = get("I", "Interpolate")?.text === "true" ? " /I true" : "";
    return { end, text: `BI /W ${w} /H ${h} /BPC ${bits} /CS /G /F /AHx${interpolate} ID ${hex}> EI` };
  }

  private inlineArraySpace(text: string, resources: PDFDict | undefined): Space {
    // Only the common inline form [/Indexed base hival <lookup>] or (lookup) is read; anything else is kept.
    const parts: Token[] = [];
    let i = 1;
    for (;;) {
      const t = readToken(text, i);
      if (!t || t.text === "]") break;
      parts.push(t);
      i = t.end;
    }
    if ((parts[0]?.text === "I" || parts[0]?.text === "Indexed") && parts[1]?.kind === "name" && parts[2]?.kind === "num" && parts[3]?.kind === "str") {
      const base = this.resolveSpace(PDFName.of(parts[1].text), resources);
      const str = parts[3].text;
      const lookup = str.startsWith("<") ? PDFHexString.of(str.slice(1, -1)).asBytes() : PDFString.of(str.slice(1, -1)).asBytes();
      return componentsOf(base) > 0 ? { t: "indexed", base, hival: parts[2].value as number, lookup } : { t: "unknown" };
    }
    return { t: "unknown" };
  }

  /** Writes a content stream back, flate-compressed, keeping the rest of its dictionary. */
  private replaceStream(ref: PDFRef | null, stream: PDFStream, contents: Uint8Array): PDFRawStream {
    const dict = this.doc.context.obj({}) as PDFDict;
    for (const [k, v] of stream.dict.entries()) if (!["Filter", "DecodeParms", "Length", "DL"].includes(k.decodeText())) dict.set(k, v);
    const next = this.doc.context.flateStream(contents, {});
    for (const [k, v] of dict.entries()) next.dict.set(k, v);
    if (ref) this.doc.context.assign(ref, next);
    return next;
  }

  /** A content stream (form, pattern, glyph, appearance) with its resources. */
  contentStream(ref: PDFObject | undefined, inherited: PDFDict | undefined, depth = 0): void {
    if (depth > 20 || !this.once(ref)) return;
    const stream = this.lookup(ref);
    if (!(stream instanceof PDFStream)) return;
    const resources = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? inherited;
    this.resources(resources, depth + 1);
    const bytes = decodeStream(stream);
    if (!bytes) {
      this.report.kept.other++;
      return;
    }
    const next = this.rewrite(latin1(bytes), resources);
    if (next !== null) this.replaceStream(ref instanceof PDFRef ? ref : null, stream, toBytes(next));
  }

  /** Everything a resources dictionary points to: forms, images, patterns, shadings, Type 3 glyphs and soft masks. */
  resources(resources: PDFDict | undefined, depth = 0): void {
    if (!resources || depth > 20) return;
    const each = (key: string, fn: (value: PDFObject, raw: PDFObject) => void) => {
      const dict = resources.lookupMaybe(PDFName.of(key), PDFDict);
      if (dict) for (const [, raw] of dict.entries()) {
        const value = this.lookup(raw);
        if (value) fn(value, raw);
      }
    };
    each("XObject", (value, raw) => {
      if (!(value instanceof PDFStream)) return;
      const subtype = nameOf(value.dict.lookup(PDFName.of("Subtype")));
      if (subtype === "Form") this.contentStream(raw, resources, depth + 1);
      else if (subtype === "Image" && raw instanceof PDFRef) this.image(raw, value, resources);
    });
    each("Pattern", (value, raw) => {
      const dict = value instanceof PDFStream ? value.dict : value instanceof PDFDict ? value : null;
      if (!dict) return;
      const type = num(dict.lookup(PDFName.of("PatternType")));
      if (type === 1) this.contentStream(raw, resources, depth + 1);
      else if (type === 2 && this.once(raw)) this.shading(dict.get(PDFName.of("Shading")), resources);
    });
    each("Shading", (_value, raw) => this.shading(raw, resources));
    each("Font", (value) => {
      if (!(value instanceof PDFDict) || nameOf(value.lookup(PDFName.of("Subtype"))) !== "Type3") return;
      const procs = value.lookupMaybe(PDFName.of("CharProcs"), PDFDict);
      const own = value.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
      if (procs) for (const [, glyph] of procs.entries()) this.contentStream(glyph, own, depth + 1);
    });
    each("ExtGState", (value) => {
      if (!(value instanceof PDFDict)) return;
      const mask = value.lookup(PDFName.of("SMask"));
      if (mask instanceof PDFDict) this.contentStream(mask.get(PDFName.of("G")), resources, depth + 1);
    });
  }

  /* -- shadings -- */

  shading(raw: PDFObject | undefined, resources: PDFDict | undefined): void {
    if (!this.once(raw)) return;
    const value = this.lookup(raw);
    const dict = value instanceof PDFStream ? value.dict : value instanceof PDFDict ? value : null;
    if (!dict) return;
    const space = this.resolveSpace(dict.get(PDFName.of("ColorSpace")), resources);
    if (space.t === "gray" && this.mode === "gray") return;
    const type = num(dict.lookup(PDFName.of("ShadingType")));
    const fn = compileFunction(this.lookup(dict.get(PDFName.of("Function"))));
    if (!convertible(space) || (!fn && type <= 3)) {
      this.report.kept.other++;
      return;
    }
    if (!fn) {
      // A mesh with its colours in the stream data.
      this.report.kept.mesh++;
      return;
    }
    const domain =
      type === 1
        ? (numbers(dict.lookup(PDFName.of("Domain"))) ?? [0, 1, 0, 1])
        : type <= 3
          ? (numbers(dict.lookup(PDFName.of("Domain"))) ?? [0, 1])
          : (numbers(dict.lookup(PDFName.of("Decode")))?.slice(4, 6) ?? [0, 1]);
    const gray = (x: number[]) => this.shade(toGray(space, fn(x)) ?? 0);
    const steps = type === 1 ? 64 : 256;
    const samples: number[] = [];
    if (type === 1) {
      const [x0, x1, y0, y1] = domain as [number, number, number, number];
      for (let j = 0; j < steps; j++) for (let i = 0; i < steps; i++) samples.push(Math.round(gray([x0 + ((x1 - x0) * i) / (steps - 1), y0 + ((y1 - y0) * j) / (steps - 1)]) * 255));
    } else {
      const [t0, t1] = domain as [number, number];
      for (let i = 0; i < steps; i++) samples.push(Math.round(gray([t0 + ((t1 - t0) * i) / (steps - 1)]) * 255));
    }
    const sampled = this.doc.context.flateStream(new Uint8Array(samples), {
      FunctionType: 0,
      Domain: domain.slice(0, type === 1 ? 4 : 2),
      Range: [0, 1],
      Size: type === 1 ? [steps, steps] : [steps],
      BitsPerSample: 8,
    });
    dict.set(PDFName.of("Function"), this.doc.context.register(sampled));
    dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceGray"));
    const background = numbers(dict.lookup(PDFName.of("Background")));
    if (background) dict.set(PDFName.of("Background"), this.doc.context.obj([this.shade(toGray(space, background) ?? 1)]));
    this.report.shadings++;
  }

  /* -- images -- */

  /** Gray (0 to 255) for each pixel of decoded image data. */
  pixelsToGray(raw: Uint8Array, w: number, h: number, space: Space, bpc: number, decode: number[] | undefined): Uint8Array {
    const comps = componentsOf(space);
    const rowBits = w * comps * bpc;
    const rowBytes = Math.ceil(rowBits / 8);
    const max = 2 ** bpc - 1;
    const out = new Uint8Array(w * h);
    const c: number[] = new Array<number>(comps).fill(0);
    const cache = new Map<string, number>();
    for (let y = 0; y < h; y++) {
      const row = y * rowBytes;
      for (let x = 0; x < w; x++) {
        for (let k = 0; k < comps; k++) {
          let v: number;
          const index = x * comps + k;
          if (bpc === 8) v = raw[row + index] ?? 0;
          else if (bpc === 16) v = raw[row + index * 2] ?? 0;
          else {
            const bit = index * bpc;
            v = ((raw[row + (bit >> 3)] ?? 0) >> (8 - bpc - (bit & 7))) & max;
          }
          const top = bpc === 16 ? 255 : max;
          const d0 = decode?.[2 * k] ?? (space.t === "indexed" ? 0 : space.t === "lab" && k > 0 ? -100 : 0);
          const d1 = decode?.[2 * k + 1] ?? (space.t === "indexed" ? max : space.t === "lab" ? 100 : 1);
          c[k] = d0 + (v * (d1 - d0)) / top;
        }
        let g: number;
        if (space.t === "gray" || space.t === "rgb" || space.t === "cmyk") g = toGray(space, c) ?? 0;
        else {
          const key = c.join(",");
          const hit = cache.get(key);
          if (hit !== undefined) g = hit;
          else {
            g = toGray(space, c) ?? 0;
            if (cache.size < 65536) cache.set(key, g);
          }
        }
        out[y * w + x] = Math.round(this.shade(g) * 255);
      }
    }
    return out;
  }

  /** 8-bit gray, or 1-bit rows in black and white mode. */
  packGray(gray: Uint8Array, w: number, h: number): { data: Uint8Array; bits: 1 | 8 } {
    if (this.mode !== "bw") return { data: gray, bits: 8 };
    const rowBytes = Math.ceil(w / 8);
    const out = new Uint8Array(rowBytes * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((gray[y * w + x] as number) >= 128) out[y * rowBytes + (x >> 3)] = (out[y * rowBytes + (x >> 3)] as number) | (0x80 >> (x & 7));
    return { data: out, bits: 1 };
  }

  private writeImage(ref: PDFRef, old: PDFDict, gray: Uint8Array, w: number, h: number, extra?: { mask?: Uint8Array }): void {
    const { data, bits } = this.packGray(gray, w, h);
    const next = this.doc.context.flateStream(data, {});
    for (const key of ["Type", "Subtype", "SMask", "Intent", "Interpolate", "Metadata", "OC", "Alt", "SMaskInData", "Matte", "StructParent", "ID", "OPI", "Name"]) {
      const v = old.get(PDFName.of(key));
      if (v !== undefined) next.dict.set(PDFName.of(key), v);
    }
    next.dict.set(PDFName.of("Type"), PDFName.of("XObject"));
    next.dict.set(PDFName.of("Subtype"), PDFName.of("Image"));
    next.dict.set(PDFName.of("Width"), PDFNumber.of(w));
    next.dict.set(PDFName.of("Height"), PDFNumber.of(h));
    next.dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(bits));
    next.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceGray"));
    keepStencil(old, next.dict);
    if (extra?.mask && !old.has(PDFName.of("SMask"))) {
      const smask = this.doc.context.flateStream(extra.mask, { Type: "XObject", Subtype: "Image", Width: w, Height: h, BitsPerComponent: 8, ColorSpace: "DeviceGray" });
      next.dict.set(PDFName.of("SMask"), this.doc.context.register(smask));
    }
    this.doc.context.assign(ref, next);
    this.report.images++;
  }

  image(ref: PDFRef, stream: PDFStream, resources: PDFDict | undefined): void {
    if (!this.once(ref)) return;
    const dict = stream.dict;
    if (dict.lookup(PDFName.of("ImageMask")) === PDFBool.True) return;
    const { names } = filtersOf(dict);
    const last = names[names.length - 1];
    if (last === "JPXDecode") {
      this.report.kept.jpeg2000++;
      return;
    }
    if (last === "CCITTFaxDecode" || last === "JBIG2Decode") return;
    const space = this.resolveSpace(dict.get(PDFName.of("ColorSpace")), resources);
    if (space.t === "gray" && this.mode === "gray") return;
    if (!convertible(space)) {
      this.report.kept.other++;
      return;
    }
    const w = num(dict.lookup(PDFName.of("Width")));
    const h = num(dict.lookup(PDFName.of("Height")));
    const bpc = num(dict.lookup(PDFName.of("BitsPerComponent")), 8);
    const decode = numbers(dict.lookup(PDFName.of("Decode")));

    // A palette picture only needs a gray palette.
    if (space.t === "indexed" && last !== "DCTDecode" && !decode && this.mode === "gray") {
      const entries = space.hival + 1;
      const table = new Uint8Array(entries);
      for (let i = 0; i < entries; i++) table[i] = Math.round((toGray(space, [i]) ?? 0) * 255);
      let hex = "";
      for (const b of table) hex += (b < 16 ? "0" : "") + b.toString(16);
      dict.set(PDFName.of("ColorSpace"), this.doc.context.obj([PDFName.of("Indexed"), PDFName.of("DeviceGray"), PDFNumber.of(space.hival), PDFHexString.of(hex)]));
      this.report.images++;
      return;
    }
    if (last === "DCTDecode") {
      if (stream instanceof PDFRawStream && !(dict.lookup(PDFName.of("Mask")) instanceof PDFArray)) this.jpegs.push({ ref, stream, space });
      else this.report.kept.jpeg++;
      return;
    }
    if (w <= 0 || h <= 0 || ![1, 2, 4, 8, 16].includes(bpc)) {
      this.report.kept.other++;
      return;
    }
    const raw = decodeStream(stream);
    const comps = componentsOf(space);
    if (!raw || raw.length < Math.ceil((w * comps * bpc) / 8) * h) {
      this.report.kept.other++;
      return;
    }
    const gray = this.pixelsToGray(raw, w, h, space, bpc, decode);
    // A colour-key mask names colours in the old space; turn it into a soft mask before the colours go.
    const key = numbers(dict.lookup(PDFName.of("Mask")));
    let mask: Uint8Array | undefined;
    if (key && key.length === comps * 2) {
      mask = new Uint8Array(w * h);
      const rowBytes = Math.ceil((w * comps * bpc) / 8);
      const max = 2 ** bpc - 1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let hidden = true;
          for (let k = 0; k < comps && hidden; k++) {
            const index = x * comps + k;
            const bit = index * bpc;
            const v = bpc === 8 ? (raw[y * rowBytes + index] ?? 0) : bpc === 16 ? (raw[y * rowBytes + index * 2] ?? 0) * 257 : ((raw[y * rowBytes + (bit >> 3)] ?? 0) >> (8 - bpc - (bit & 7))) & max;
            hidden = v >= (key[2 * k] as number) && v <= (key[2 * k + 1] as number);
          }
          mask[y * w + x] = hidden ? 0 : 255;
        }
    }
    this.writeImage(ref, dict, gray, w, h, { mask });
  }

  /** JPEGs go through the codec at the end, one by one. */
  async jpegPass(codec: GrayImageCodec | undefined, quality: number, onProgress?: (done: number, total: number) => void): Promise<void> {
    const list = this.jpegs.splice(0);
    for (const [n, job] of list.entries()) {
      onProgress?.(n, list.length);
      const { ref, stream } = job;
      const jpeg = decodeStream(stream, ["DCTDecode"]);
      const decoded = codec && jpeg ? await codec.decodeJpeg(jpeg).catch(() => null) : null;
      if (!decoded) {
        this.report.kept.jpeg++;
        continue;
      }
      const { width: w, height: h, data } = decoded;
      const gray = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p++) gray[p] = Math.round(this.shade(toGray({ t: "rgb" }, [(data[p * 4] ?? 0) / 255, (data[p * 4 + 1] ?? 0) / 255, (data[p * 4 + 2] ?? 0) / 255]) ?? 0) * 255);
      if (this.mode === "bw" || !codec) {
        this.writeImage(ref, stream.dict, gray, w, h);
        continue;
      }
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let p = 0; p < w * h; p++) {
        const g = gray[p] as number;
        rgba[p * 4] = g;
        rgba[p * 4 + 1] = g;
        rgba[p * 4 + 2] = g;
        rgba[p * 4 + 3] = 255;
      }
      const encoded = await codec.encodeJpeg(rgba, w, h, quality).catch(() => null);
      if (!encoded) {
        this.writeImage(ref, stream.dict, gray, w, h);
        continue;
      }
      // The canvas only writes colour JPEGs, so the picture is stored as RGB with every pixel gray.
      const next = this.doc.context.stream(encoded, {});
      for (const key of ["Type", "Subtype", "SMask", "Intent", "Interpolate", "Metadata", "OC", "Alt", "StructParent", "Name"]) {
        const v = stream.dict.get(PDFName.of(key));
        if (v !== undefined) next.dict.set(PDFName.of(key), v);
      }
      next.dict.set(PDFName.of("Type"), PDFName.of("XObject"));
      next.dict.set(PDFName.of("Subtype"), PDFName.of("Image"));
      next.dict.set(PDFName.of("Width"), PDFNumber.of(w));
      next.dict.set(PDFName.of("Height"), PDFNumber.of(h));
      next.dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
      next.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
      next.dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      keepStencil(stream.dict, next.dict);
      this.doc.context.assign(ref, next);
      this.report.images++;
    }
    onProgress?.(list.length, list.length);
  }

  /* -- annotations and forms -- */

  private grayArray(dict: PDFDict, key: string): void {
    const c = numbers(dict.lookup(PDFName.of(key)));
    if (!c || c.length === 0) return;
    const space: Space = c.length === 1 ? GRAY : c.length === 3 ? { t: "rgb" } : c.length === 4 ? { t: "cmyk" } : { t: "unknown" };
    const v = toGray(space, c);
    if (v === null) return;
    if (c.length === 1 && this.shade(v) === c[0]) return;
    dict.set(PDFName.of(key), this.doc.context.obj([this.shade(v)]));
    this.report.colors++;
  }

  private daString(dict: PDFDict): void {
    const da = dict.lookup(PDFName.of("DA"));
    if (!(da instanceof PDFString || da instanceof PDFHexString)) return;
    const next = this.rewrite(da.decodeText(), undefined);
    if (next !== null) dict.set(PDFName.of("DA"), PDFString.of(next));
  }

  annotations(page: { node: PDFDict }, resources: PDFDict | undefined): void {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      this.grayArray(annot, "C");
      this.grayArray(annot, "IC");
      const mk = annot.lookupMaybe(PDFName.of("MK"), PDFDict);
      if (mk) {
        this.grayArray(mk, "BG");
        this.grayArray(mk, "BC");
      }
      this.daString(annot);
      const ap = annot.lookupMaybe(PDFName.of("AP"), PDFDict);
      if (!ap) continue;
      for (const key of ["N", "R", "D"]) {
        const raw = ap.get(PDFName.of(key));
        const value = this.lookup(raw);
        if (value instanceof PDFStream) this.contentStream(raw, resources);
        else if (value instanceof PDFDict) for (const [, state] of value.entries()) this.contentStream(state, resources);
      }
    }
  }

  page(page: { node: PDFDict & { Resources(): PDFDict | undefined } }): void {
    const resources = page.node.Resources();
    this.resources(resources);
    const contents = page.node.get(PDFName.of("Contents"));
    const list = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const parts: string[] = [];
    for (const part of list) {
      const stream = this.lookup(part);
      const bytes = stream instanceof PDFStream ? decodeStream(stream) : null;
      if (!bytes) {
        if (stream) this.report.kept.other++;
        return this.annotations(page, resources);
      }
      parts.push(latin1(bytes));
    }
    if (parts.length) {
      const next = this.rewrite(parts.join("\n"), resources);
      if (next !== null) {
        const stream = this.doc.context.flateStream(toBytes(next));
        page.node.set(PDFName.of("Contents"), this.doc.context.register(stream));
      }
    }
    this.annotations(page, resources);
  }
}

/** An explicit stencil mask (a picture) still applies; a colour-key mask (numbers) is handled by the caller. */
function keepStencil(from: PDFDict, to: PDFDict): void {
  const mask = from.get(PDFName.of("Mask"));
  if (mask instanceof PDFRef) to.set(PDFName.of("Mask"), mask);
}

/** Turns every colour in a PDF to gray, or to black and white, keeping text and drawings as they are. */
export async function grayscalePdf(bytes: Uint8Array, options: GrayscaleOptions = {}): Promise<GrayscaleResult> {
  const { mode = "gray", threshold = 0.5, codec, jpegQuality = 0.85, onProgress } = options;
  if (!(threshold > 0 && threshold < 1)) throw new PdfError("Choose a black and white threshold between 1% and 99%.");
  const doc = await loadPdf(bytes);
  const converter = new Converter(doc, mode, threshold);
  const pages = doc.getPages();
  for (const page of pages) converter.page(page as never);
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (form) {
    const da = form.lookup(PDFName.of("DA"));
    if (da instanceof PDFString || da instanceof PDFHexString) {
      const next = converter.rewrite(da.decodeText(), undefined);
      if (next !== null) form.set(PDFName.of("DA"), PDFString.of(next));
    }
  }
  await converter.jpegPass(codec, jpegQuality, onProgress);
  const data = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { data, ...converter.report };
}
