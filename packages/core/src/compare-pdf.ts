/**
 * Logic for the "Compare PDFs" tool: what changed between two versions of a document, by text and by looks.
 * Works on page text and pixel counts handed in by the tool, so it stays free of React, the DOM and the network.
 */

import { diffText, toSplitRows, type DiffSegment, type SplitRow } from "./diff";

/* ----------------------------------------------------------------------------------------------- */
/* Text                                                                                             */
/* ----------------------------------------------------------------------------------------------- */

export interface TextCompareOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

/** The text of a document as a list of non-empty lines, each remembering the page it came from (1-based). */
export interface DocumentLines {
  lines: string[];
  pageOfLine: number[];
}

export function documentLines(pages: readonly string[]): DocumentLines {
  const lines: string[] = [];
  const pageOfLine: number[] = [];
  pages.forEach((text, i) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      if (line.trim() === "") continue;
      lines.push(line);
      pageOfLine.push(i + 1);
    }
  });
  return { lines, pageOfLine };
}

export interface CompareRow {
  /** Present when the line exists in the first document. `page` is its page number. */
  left?: { number: number; text: string; page: number; changed: boolean };
  /** Present when the line exists in the second document. */
  right?: { number: number; text: string; page: number; changed: boolean };
  /** Word-level changes inside a line that was edited (both sides present). */
  inline?: { left: DiffSegment[]; right: DiffSegment[] };
}

export interface TextComparison {
  rows: CompareRow[];
  /** Lines only in the first document (removed or edited). */
  removedLines: number;
  /** Lines only in the second document (added or edited). */
  addedLines: number;
  /** Pages (1-based) of the first document that lost or changed a line. */
  changedPagesA: number[];
  /** Pages (1-based) of the second document that gained or changed a line. */
  changedPagesB: number[];
  identical: boolean;
}

/** Word-level difference between two versions of a line: `left` keeps the unchanged and removed words, `right` the unchanged and added ones. */
export function inlineSegments(left: string, right: string, options: TextCompareOptions = {}): { left: DiffSegment[]; right: DiffSegment[] } {
  const segments = diffText(left, right, { mode: "words", ignoreCase: options.ignoreCase });
  return {
    left: segments.filter((s) => s.type !== "added"),
    right: segments.filter((s) => s.type !== "removed"),
  };
}

/** Compare the text of two documents, page by page text in reading order, and say which pages changed. */
export function compareText(pagesA: readonly string[], pagesB: readonly string[], options: TextCompareOptions = {}): TextComparison {
  const a = documentLines(pagesA);
  const b = documentLines(pagesB);
  // Every line ends in a newline: otherwise jsdiff sees a last line "C" and a middle line "C\n" as different text.
  const asText = (lines: string[]) => lines.map((l) => `${l}\n`).join("");
  const segments = diffText(asText(a.lines), asText(b.lines), { mode: "lines", ignoreWhitespace: options.ignoreWhitespace, ignoreCase: options.ignoreCase });
  const split: SplitRow[] = toSplitRows(segments);

  let removedLines = 0;
  let addedLines = 0;
  const changedA = new Set<number>();
  const changedB = new Set<number>();
  const rows: CompareRow[] = split.map((row) => {
    const out: CompareRow = {};
    if (row.left) {
      const page = a.pageOfLine[row.left.number - 1] ?? 1;
      out.left = { ...row.left, page };
      if (row.left.changed) {
        removedLines++;
        changedA.add(page);
      }
    }
    if (row.right) {
      const page = b.pageOfLine[row.right.number - 1] ?? 1;
      out.right = { ...row.right, page };
      if (row.right.changed) {
        addedLines++;
        changedB.add(page);
      }
    }
    if (out.left?.changed && out.right?.changed) out.inline = inlineSegments(out.left.text, out.right.text, options);
    return out;
  });

  const sorted = (set: Set<number>) => Array.from(set).sort((x, y) => x - y);
  return { rows, removedLines, addedLines, changedPagesA: sorted(changedA), changedPagesB: sorted(changedB), identical: removedLines === 0 && addedLines === 0 };
}

export type CollapsedItem = { kind: "row"; row: CompareRow; index: number } | { kind: "gap"; count: number; from: number };

/** Keep changed rows plus `context` unchanged rows around them; hide the long unchanged stretches between. */
export function collapseRows(rows: readonly CompareRow[], context = 2): CollapsedItem[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, i) => {
    if (row.left?.changed || row.right?.changed) {
      for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
    }
  });
  const out: CollapsedItem[] = [];
  let i = 0;
  while (i < rows.length) {
    if (keep[i]) {
      out.push({ kind: "row", row: rows[i] as CompareRow, index: i });
      i++;
    } else {
      const from = i;
      while (i < rows.length && !keep[i]) i++;
      out.push({ kind: "gap", count: i - from, from });
    }
  }
  return out;
}

/** True when a document has essentially no text layer, as a scan does. */
export function looksScanned(pages: readonly string[]): boolean {
  return pages.length > 0 && pages.every((p) => p.replace(/\s+/g, "").length < 5);
}

/** Plain-text report of the changes, for copying. */
export function textReport(comparison: TextComparison, names: { a: string; b: string }): string {
  const out = [`Comparison of ${names.a} (A) and ${names.b} (B)`, ""];
  if (comparison.identical) return [...out, "The text is identical."].join("\n");
  out.push(`${comparison.removedLines} line${comparison.removedLines === 1 ? "" : "s"} removed or changed in A, ${comparison.addedLines} added or changed in B.`);
  out.push(`Pages changed in A: ${comparison.changedPagesA.join(", ") || "none"}`);
  out.push(`Pages changed in B: ${comparison.changedPagesB.join(", ") || "none"}`, "");
  for (const row of comparison.rows) {
    if (row.left?.changed) out.push(`- [A p.${row.left.page}] ${row.left.text}`);
    if (row.right?.changed) out.push(`+ [B p.${row.right.page}] ${row.right.text}`);
  }
  return out.join("\n");
}

/* ----------------------------------------------------------------------------------------------- */
/* Pages as pictures                                                                                */
/* ----------------------------------------------------------------------------------------------- */

/** Share of pixels (0-1) that must differ before a page counts as changed. */
export const PAGE_CHANGE_LIMIT = 0.0005;

export interface PageChange {
  /** 1-based page number, in both documents. */
  page: number;
  /** Share of the page's pixels that differ, 0-1. */
  percent: number;
  changed: boolean;
  /** The two pages have different proportions, so one was stretched to fit the other. */
  sizeDiffers: boolean;
}

/** True when two page shapes differ by more than 1%, judged by width ÷ height. */
export function shapesDiffer(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return true;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / Math.max(ra, rb) > 0.01;
}

export function pageChange(page: number, percent: number, sizeDiffers: boolean, limit = PAGE_CHANGE_LIMIT): PageChange {
  return { page, percent, changed: percent > limit || sizeDiffers, sizeDiffers };
}

export interface PagePairs {
  /** Pages present in both documents, compared one to one by position. */
  common: number;
  /** Pages (1-based) that exist only in the first document. */
  onlyInA: number[];
  /** Pages (1-based) that exist only in the second document. */
  onlyInB: number[];
}

export function pairPages(countA: number, countB: number): PagePairs {
  const common = Math.min(countA, countB);
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i + 1);
  return { common, onlyInA: range(common, countA), onlyInB: range(common, countB) };
}

/** Next changed page after `current` (wrapping round), or null when none changed. */
export function nextChangedPage(changes: readonly PageChange[], current: number, direction: 1 | -1 = 1): number | null {
  const changed = changes.filter((c) => c.changed).map((c) => c.page);
  if (changed.length === 0) return null;
  if (direction === 1) return changed.find((p) => p > current) ?? (changed[0] as number);
  return [...changed].reverse().find((p) => p < current) ?? (changed[changed.length - 1] as number);
}
