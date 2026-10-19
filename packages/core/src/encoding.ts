/** Encoders and decoders. All functions are pure and UTF-8 safe. */

export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecodeError";
  }
}

const textEncoder = new TextEncoder();

export function utf8ToBytes(input: string): Uint8Array {
  return textEncoder.encode(input);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DecodeError("The decoded bytes are not valid UTF-8 text.");
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array, options: { urlSafe?: boolean; padding?: boolean } = {}): string {
  const { urlSafe = false, padding = true } = options;
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64[b2 & 63];
  }
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
  if (!padding) out = out.replace(/=+$/, "");
  return out;
}

export function base64ToBytes(input: string): Uint8Array {
  let s = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (/[^A-Za-z0-9+/=]/.test(s)) throw new DecodeError("Input contains characters that are not valid Base64.");
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new DecodeError("Input is not valid Base64 (bad length).");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function base64Encode(input: string, options: { urlSafe?: boolean; padding?: boolean } = {}): string {
  return bytesToBase64(utf8ToBytes(input), options);
}

export function base64Decode(input: string): string {
  return bytesToUtf8(base64ToBytes(input));
}

export function urlEncode(input: string, mode: "component" | "full" = "component"): string {
  try {
    return mode === "component" ? encodeURIComponent(input) : encodeURI(input);
  } catch {
    throw new DecodeError("Input contains an unpaired surrogate and cannot be encoded.");
  }
}

export function urlDecode(input: string, mode: "component" | "full" = "component"): string {
  try {
    // Treat `+` as a space only for form-encoded query strings.
    return mode === "component" ? decodeURIComponent(input.replace(/\+/g, " ")) : decodeURI(input);
  } catch {
    throw new DecodeError("Input contains a malformed percent-escape sequence.");
  }
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function htmlEscape(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] as string);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  deg: "°",
  times: "×",
  divide: "÷",
};

export function htmlUnescape(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const cp = parseInt(body.slice(2), 16);
      return isValidCodePoint(cp) ? String.fromCodePoint(cp) : match;
    }
    if (body.startsWith("#")) {
      const cp = parseInt(body.slice(1), 10);
      return isValidCodePoint(cp) ? String.fromCodePoint(cp) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function isValidCodePoint(cp: number): boolean {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

export function hexEncode(input: string, options: { separator?: string; uppercase?: boolean } = {}): string {
  const { separator = " ", uppercase = false } = options;
  const hex = Array.from(utf8ToBytes(input), (b) => b.toString(16).padStart(2, "0"));
  const out = hex.join(separator);
  return uppercase ? out.toUpperCase() : out;
}

export function hexDecode(input: string): string {
  const clean = input.replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) throw new DecodeError("Input is not valid hexadecimal.");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytesToUtf8(bytes);
}

export function binaryEncode(input: string): string {
  return Array.from(utf8ToBytes(input), (b) => b.toString(2).padStart(8, "0")).join(" ");
}

export function binaryDecode(input: string): string {
  const clean = input.replace(/\s+/g, "");
  if (clean.length % 8 !== 0 || /[^01]/.test(clean)) throw new DecodeError("Input must be groups of 8 binary digits.");
  const bytes = new Uint8Array(clean.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 8, i * 8 + 8), 2);
  return bytesToUtf8(bytes);
}

export function rot13(input: string, shift = 13): string {
  const s = ((shift % 26) + 26) % 26;
  return input.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + s) % 26) + base);
  });
}

const MORSE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---",
  k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-",
  u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....",
  "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.",
  "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-",
  "+": ".-.-.", "-": "-....-", _: "..--.-", '"': ".-..-.", $: "...-..-", "@": ".--.-.",
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function morseEncode(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => Array.from(word, (c) => MORSE[c] ?? "").filter(Boolean).join(" "))
    .join(" / ");
}

export function morseDecode(input: string): string {
  return input
    .trim()
    .split(/\s*\/\s*|\s{3,}/)
    .map((word) =>
      word
        .split(/\s+/)
        .map((code) => MORSE_REVERSE[code] ?? "")
        .join(""),
    )
    .join(" ");
}

/** Escape text for use inside a string literal of the given language. */
export function escapeString(input: string, language: "json" | "javascript" | "python" | "csharp" | "sql" | "shell"): string {
  switch (language) {
    case "json":
      return JSON.stringify(input).slice(1, -1);
    case "javascript":
    case "csharp":
    case "python":
      return JSON.stringify(input)
        .slice(1, -1)
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
    case "sql":
      return input.replace(/'/g, "''");
    case "shell":
      return `'${input.replace(/'/g, `'\\''`)}'`;
  }
}

const SIMPLE_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };

/** Turn `\n`, `\t`, `\"`, `\uXXXX`, `\xXX` and friends back into characters. */
export function unescapeString(input: string): string {
  return input.replace(
    /\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|([\s\S]))/gi,
    (_m, braced: string | undefined, u4: string | undefined, x2: string | undefined, ch: string | undefined) => {
      const hex = braced ?? u4 ?? x2;
      if (hex !== undefined) {
        const cp = parseInt(hex, 16);
        return isValidCodePoint(cp) ? String.fromCodePoint(cp) : _m;
      }
      return SIMPLE_ESCAPES[ch as string] ?? (ch as string);
    },
  );
}

export function unicodeEscape(input: string): string {
  return Array.from(input, (ch) => {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) return ch;
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      return `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
    }
    return `\\u${cp.toString(16).padStart(4, "0")}`;
  }).join("");
}

export function unicodeUnescape(input: string): string {
  return input.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (_, braced: string | undefined, plain: string | undefined) =>
    String.fromCodePoint(parseInt((braced ?? plain) as string, 16)),
  );
}
