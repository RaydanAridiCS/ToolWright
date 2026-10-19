/** Text diffing built on the `diff` package. */

import { createTwoFilesPatch, diffChars, diffLines, diffWords, type ChangeObject } from "diff";

export type DiffMode = "lines" | "words" | "chars";

export interface DiffSegment {
  type: "added" | "removed" | "same";
  value: string;
}

export interface DiffOptions {
  mode?: DiffMode;
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
  identical: boolean;
}

const toSegments = (changes: ChangeObject<string>[]): DiffSegment[] =>
  changes.map((c) => ({ type: c.added ? "added" : c.removed ? "removed" : "same", value: c.value }));

export function diffText(a: string, b: string, options: DiffOptions = {}): DiffSegment[] {
  const { mode = "lines", ignoreWhitespace = false, ignoreCase = false } = options;
  switch (mode) {
    case "words":
      return toSegments(diffWords(a, b, { ignoreCase }));
    case "chars":
      return toSegments(diffChars(a, b, { ignoreCase }));
    default: {
      // jsdiff's own ignoreWhitespace only trims line ends, so compare with inner whitespace collapsed as well.
      const normalize = (line: string) => {
        const text = ignoreWhitespace ? line.trim().replace(/\s+/g, " ") : line;
        return ignoreCase ? text.toLowerCase() : text;
      };
      // `comparator` is supported at runtime but missing from the published type definitions.
      const options = { comparator: (left: string, right: string) => normalize(left) === normalize(right) } as Parameters<typeof diffLines>[2];
      return toSegments(diffLines(a, b, options));
    }
  }
}

const countUnits = (value: string, mode: DiffMode) =>
  mode === "lines" ? value.split("\n").length - (value.endsWith("\n") ? 1 : 0) : mode === "words" ? (value.match(/\S+/g) ?? []).length : Array.from(value).length;

export function diffStats(segments: DiffSegment[], mode: DiffMode = "lines"): DiffStats {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const s of segments) {
    const n = countUnits(s.value, mode);
    if (s.type === "added") added += n;
    else if (s.type === "removed") removed += n;
    else unchanged += n;
  }
  return { added, removed, unchanged, identical: added === 0 && removed === 0 };
}

export interface SplitRow {
  left?: { number: number; text: string; changed: boolean };
  right?: { number: number; text: string; changed: boolean };
}

const splitLines = (value: string) => {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** Side-by-side rows for a line diff. Adjacent removed/added blocks are paired up. */
export function toSplitRows(segments: DiffSegment[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let l = 1;
  let r = 1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as DiffSegment;
    if (seg.type === "same") {
      for (const text of splitLines(seg.value)) rows.push({ left: { number: l++, text, changed: false }, right: { number: r++, text, changed: false } });
    } else if (seg.type === "removed") {
      const next = segments[i + 1];
      const removed = splitLines(seg.value);
      const added = next?.type === "added" ? splitLines(next.value) : [];
      if (next?.type === "added") i++;
      const count = Math.max(removed.length, added.length);
      for (let k = 0; k < count; k++) {
        rows.push({
          left: removed[k] !== undefined ? { number: l++, text: removed[k] as string, changed: true } : undefined,
          right: added[k] !== undefined ? { number: r++, text: added[k] as string, changed: true } : undefined,
        });
      }
    } else {
      for (const text of splitLines(seg.value)) rows.push({ right: { number: r++, text, changed: true } });
    }
  }
  return rows;
}

export function unifiedPatch(a: string, b: string, names: { from?: string; to?: string } = {}, context = 3): string {
  return createTwoFilesPatch(names.from ?? "original", names.to ?? "modified", a, b, "", "", { context });
}
