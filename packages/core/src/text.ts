/** Text utilities: case conversion, counting, line operations, slugs. */

export type CaseStyle =
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "dot"
  | "path"
  | "title"
  | "sentence"
  | "upper"
  | "lower"
  | "swap";

/** Split a string into lowercase words, understanding camelCase, snake_case, kebab-case and spaces. */
export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const capitalize = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);

export function convertCase(input: string, style: CaseStyle): string {
  switch (style) {
    case "upper":
      return input.toUpperCase();
    case "lower":
      return input.toLowerCase();
    case "swap":
      return Array.from(input)
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join("");
    case "sentence":
      return input
        .toLowerCase()
        .replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (m) => m.toUpperCase());
    case "title":
      return input.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    default:
      break;
  }
  // Word-based styles are applied line by line so multi-line input keeps its structure.
  return input
    .split("\n")
    .map((line) => {
      const words = splitWords(line).map((w) => w.toLowerCase());
      switch (style) {
        case "camel":
          return words.map((w, i) => (i === 0 ? w : capitalize(w))).join("");
        case "pascal":
          return words.map(capitalize).join("");
        case "snake":
          return words.join("_");
        case "kebab":
          return words.join("-");
        case "constant":
          return words.join("_").toUpperCase();
        case "dot":
          return words.join(".");
        case "path":
          return words.join("/");
        default:
          return line;
      }
    })
    .join("\n");
}

export interface SlugOptions {
  separator?: string;
  lowercase?: boolean;
  maxLength?: number;
}

/** URL-safe slug. Strips diacritics, collapses separators. */
export function slugify(input: string, options: SlugOptions = {}): string {
  const { separator = "-", lowercase = true, maxLength } = options;
  let out = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}+|${escapeRegExp(separator)}+$`, "g"), "");
  if (lowercase) out = out.toLowerCase();
  if (maxLength && out.length > maxLength) {
    out = out.slice(0, maxLength).replace(new RegExp(`${escapeRegExp(separator)}+$`), "");
  }
  return out;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
  sentences: number;
  paragraphs: number;
  bytes: number;
  /** Estimated reading time in minutes at 230 wpm. */
  readingMinutes: number;
  /** Estimated speaking time in minutes at 130 wpm. */
  speakingMinutes: number;
}

export function countText(input: string): TextStats {
  const trimmed = input.trim();
  const words = trimmed ? trimmed.split(/\s+/u).length : 0;
  const sentences = trimmed ? (trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).filter((s) => s.trim()).length : 0;
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  return {
    characters: Array.from(input).length,
    charactersNoSpaces: Array.from(input.replace(/\s/gu, "")).length,
    words,
    lines: input === "" ? 0 : input.split(/\r\n|\r|\n/).length,
    sentences,
    paragraphs,
    bytes: new TextEncoder().encode(input).length,
    readingMinutes: words / 230,
    speakingMinutes: words / 130,
  };
}

export interface LineOptions {
  sort?: "none" | "asc" | "desc" | "length" | "natural" | "random";
  dedupe?: boolean;
  reverse?: boolean;
  trim?: boolean;
  removeEmpty?: boolean;
  caseInsensitive?: boolean;
}

/** Apply a pipeline of line operations: trim → remove empty → dedupe → sort → reverse. */
export function processLines(input: string, options: LineOptions = {}, random: () => number = Math.random): string {
  let lines = input.split(/\r\n|\r|\n/);
  if (options.trim) lines = lines.map((l) => l.trim());
  if (options.removeEmpty) lines = lines.filter((l) => l.trim() !== "");
  if (options.dedupe) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const key = options.caseInsensitive ? l.toLowerCase() : l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const key = (l: string) => (options.caseInsensitive ? l.toLowerCase() : l);
  switch (options.sort) {
    case "asc":
      lines.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      break;
    case "desc":
      lines.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
      break;
    case "length":
      lines.sort((a, b) => a.length - b.length);
      break;
    case "natural": {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: options.caseInsensitive ? "accent" : "variant" });
      lines.sort(collator.compare);
      break;
    }
    case "random":
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [lines[i], lines[j]] = [lines[j] as string, lines[i] as string];
      }
      break;
    default:
      break;
  }
  if (options.reverse) lines.reverse();
  return lines.join("\n");
}

/** Prefix/suffix every line, optionally numbering them. */
export function decorateLines(
  input: string,
  options: { prefix?: string; suffix?: string; numbered?: boolean; startAt?: number } = {},
): string {
  const { prefix = "", suffix = "", numbered = false, startAt = 1 } = options;
  return input
    .split(/\r\n|\r|\n/)
    .map((line, i) => `${numbered ? `${startAt + i}. ` : ""}${prefix}${line}${suffix}`)
    .join("\n");
}

export interface WordFrequency {
  word: string;
  count: number;
}

export function wordFrequency(input: string, limit = 50): WordFrequency[] {
  const counts = new Map<string, number>();
  for (const w of input.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? []) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** Collapse whitespace in a number of ways. */
export function cleanWhitespace(
  input: string,
  options: { collapseSpaces?: boolean; trimLines?: boolean; collapseBlankLines?: boolean; removeLineBreaks?: boolean } = {},
): string {
  let out = input.replace(/\r\n?/g, "\n");
  if (options.trimLines) out = out.split("\n").map((l) => l.trim()).join("\n");
  if (options.collapseSpaces) out = out.replace(/[^\S\n]+/g, " ");
  if (options.collapseBlankLines) out = out.replace(/\n{3,}/g, "\n\n");
  if (options.removeLineBreaks) out = out.replace(/\s*\n+\s*/g, " ");
  return out.trim();
}

/** Reverse a string by grapheme where Intl.Segmenter is available. */
export function reverseText(input: string, mode: "characters" | "words" = "characters"): string {
  if (mode === "words") return input.split(/(\s+)/).reverse().join("");
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(input), (s) => s.segment).reverse().join("");
  }
  return Array.from(input).reverse().join("");
}

/** Find and replace helper that supports plain text and regular expressions. */
export function findReplace(
  input: string,
  find: string,
  replacement: string,
  options: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean } = {},
): { output: string; count: number } {
  if (!find) return { output: input, count: 0 };
  let source = options.regex ? find : escapeRegExp(find);
  if (options.wholeWord) source = `\\b(?:${source})\\b`;
  const re = new RegExp(source, `g${options.caseSensitive ? "" : "i"}u`);
  const count = Array.from(input.matchAll(re)).length;
  // Plain-text replacements must not interpret `$&`, `$1`, etc.
  const output = options.regex ? input.replace(re, replacement) : input.replace(re, () => replacement);
  return { output, count };
}
