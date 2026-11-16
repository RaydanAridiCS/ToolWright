/**
 * Split a PDF into several files: every page, every N pages, page ranges, at chosen pages, at bookmarks (each part
 * named after its bookmark), into odd and even pages, or into parts no bigger than a file size. `planSplit` works out
 * the parts without touching the file (the page grid shows them before anything is made); `splitDocument` makes them.
 * Each part keeps the bookmarks that point into it.
 */
import { PDFDocument, type PDFRef } from "pdf-lib";
import { loadPdf, parsePageRanges, PdfError, type SplitPart } from "./pdf";
import { fileNameFromTitle, plainView, readOutline, writeOutline, type NewOutlineItem, type OutlineItem } from "./pdf-outline";

export type SplitPlanMode =
  | { type: "each" }
  | { type: "every"; pages: number }
  | { type: "ranges"; spec: string }
  /** Zero-based pages that start a new part (page 0 always starts the first). */
  | { type: "cuts"; starts: number[] }
  /** A part at every bookmark of the top level (1) or the top two levels (2). */
  | { type: "bookmarks"; level: 1 | 2 }
  | { type: "odd-even" }
  /** Parts as large as possible without going over `maxBytes`. Only known once made. */
  | { type: "size"; maxBytes: number };

export interface PlannedPart {
  /** Zero-based page indexes, in order. */
  pages: number[];
  /** A name for the part, such as a bookmark title. */
  label?: string;
  /** Used in the file name instead of the part number's place. */
  slug?: string;
}

export const SPLIT_LIMITS = { maxParts: 2000, minBytes: 20 * 1024 } as const;

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** Where each bookmark of the top `level` levels starts, in page order, one per page (the first title wins). */
export function bookmarkStarts(outline: readonly OutlineItem[], level: 1 | 2): { page: number; title: string }[] {
  const found: { page: number; title: string }[] = [];
  const visit = (items: readonly OutlineItem[], depth: number) => {
    for (const it of items) {
      if (it.page !== null) found.push({ page: it.page, title: it.title });
      if (depth < level) visit(it.children, depth + 1);
    }
  };
  visit(outline, 1);
  const byPage = new Map<number, string>();
  for (const f of [...found].sort((a, b) => a.page - b.page)) if (!byPage.has(f.page)) byPage.set(f.page, f.title);
  return [...byPage].map(([page, title]) => ({ page, title }));
}

function fromStarts(starts: readonly number[], pageCount: number, labels?: Map<number, string>): PlannedPart[] {
  const sorted = [...new Set([0, ...starts])].filter((s) => s >= 0 && s < pageCount).sort((a, b) => a - b);
  return sorted.map((s, i) => {
    const label = labels?.get(s);
    return { pages: range(s, sorted[i + 1] ?? pageCount), ...(label !== undefined ? { label, slug: fileNameFromTitle(label) } : {}) };
  });
}

/** The parts a split will make, or null for a split by size (which depends on the file). Throws readable errors. */
export function planSplit(mode: SplitPlanMode, pageCount: number, outline: readonly OutlineItem[] = []): PlannedPart[] | null {
  if (pageCount < 1) throw new PdfError("This PDF has no pages.");
  let parts: PlannedPart[];
  switch (mode.type) {
    case "each":
      parts = range(0, pageCount).map((p) => ({ pages: [p] }));
      break;
    case "every":
      if (!Number.isInteger(mode.pages) || mode.pages < 1) throw new PdfError("Pages per file must be a positive whole number.");
      parts = [];
      for (let i = 0; i < pageCount; i += mode.pages) parts.push({ pages: range(i, Math.min(pageCount, i + mode.pages)) });
      break;
    case "ranges": {
      const groups = mode.spec
        .split(";")
        .map((g) => g.trim())
        .filter(Boolean);
      if (groups.length === 0) throw new PdfError("Enter at least one range. Separate files with semicolons: 1-3; 4-6.");
      parts = groups.map((g) => ({ pages: parsePageRanges(g, pageCount) }));
      break;
    }
    case "cuts":
      parts = fromStarts(mode.starts, pageCount);
      break;
    case "bookmarks": {
      const starts = bookmarkStarts(outline, mode.level);
      if (starts.length === 0) throw new PdfError("This PDF has no bookmarks that point to its pages.");
      const labels = new Map(starts.map((s) => [s.page, s.title]));
      if (!labels.has(0)) labels.set(0, "Start");
      parts = fromStarts(
        starts.map((s) => s.page),
        pageCount,
        labels,
      );
      break;
    }
    case "odd-even": {
      const odd = range(0, pageCount).filter((p) => p % 2 === 0);
      const even = range(0, pageCount).filter((p) => p % 2 === 1);
      parts = [{ pages: odd, label: "Odd pages", slug: "odd-pages" }];
      if (even.length) parts.push({ pages: even, label: "Even pages", slug: "even-pages" });
      break;
    }
    case "size":
      if (!(mode.maxBytes >= SPLIT_LIMITS.minBytes)) throw new PdfError(`Choose a size of at least ${SPLIT_LIMITS.minBytes / 1024} KB.`);
      return null;
  }
  if (parts.length > SPLIT_LIMITS.maxParts) throw new PdfError(`That makes ${parts.length} files. At most ${SPLIT_LIMITS.maxParts} can be made at once.`);
  return parts;
}

/** Copy pages into a new file, with the bookmarks that point to them. */
async function makePart(src: PDFDocument, pages: readonly number[], outline: readonly OutlineItem[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new PdfError("A part has no pages.");
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, [...pages]);
  const refOf = new Map<number, PDFRef>();
  copied.forEach((p, i) => {
    out.addPage(p);
    if (!refOf.has(pages[i] as number)) refOf.set(pages[i] as number, p.ref);
  });
  if (outline.length) {
    const map = (items: readonly OutlineItem[]): NewOutlineItem[] => items.map((it) => ({ title: it.title, pageRef: it.page === null ? null : (refOf.get(it.page) ?? null), view: plainView(it.view), children: map(it.children) }));
    writeOutline(out, map(outline));
  }
  return out.save({ useObjectStreams: true });
}

export interface SplitProgress {
  done: number;
  total: number;
}

/**
 * Make the parts. Names are `<base>-1.pdf` and so on (zero-padded to the number of parts), with the bookmark title or "odd-pages" added where there is one.
 * A split by size grows each part while the saved file still fits; a single page bigger than the limit becomes a
 * part of its own (`oversized` counts them).
 */
export async function splitDocument(
  bytes: Uint8Array,
  mode: SplitPlanMode,
  base = "split",
  options: { keepBookmarks?: boolean; onProgress?: (p: SplitProgress) => void; signal?: AbortSignal } = {},
): Promise<{ parts: SplitPart[]; oversized: number }> {
  const { keepBookmarks = true, onProgress, signal } = options;
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  const outline = readOutline(src);
  const kept = keepBookmarks ? outline : [];
  const check = () => {
    if (signal?.aborted) throw new PdfError("Stopped. Nothing was saved.");
  };
  let planned = planSplit(mode, count, outline);
  const made: Uint8Array[] = [];
  let oversized = 0;

  if (planned === null) {
    const max = (mode as { maxBytes: number }).maxBytes;
    planned = [];
    let start = 0;
    while (start < count) {
      check();
      onProgress?.({ done: start, total: count });
      const size = async (n: number) => {
        const data = await makePart(src, range(start, start + n), kept);
        return { n, data };
      };
      let best = await size(1);
      if (best.data.length > max) oversized++;
      else {
        // Double the part while it fits, then halve the gap to the first size that does not.
        let tooBig = Infinity;
        let n = 1;
        while (start + best.n < count) {
          check();
          const next = Math.min(count - start, n * 2);
          const tried = await size(next);
          if (tried.data.length <= max) {
            best = tried;
            n = next;
          } else {
            tooBig = next;
            break;
          }
        }
        let lo = best.n;
        let hi = Math.min(tooBig, count - start + 1);
        while (hi - lo > 1) {
          check();
          const mid = Math.floor((lo + hi) / 2);
          const tried = await size(mid);
          if (tried.data.length <= max) {
            best = tried;
            lo = mid;
          } else hi = mid;
        }
      }
      planned.push({ pages: range(start, start + best.n) });
      made.push(best.data);
      start += best.n;
      if (planned.length > SPLIT_LIMITS.maxParts) throw new PdfError(`That makes more than ${SPLIT_LIMITS.maxParts} files. Choose a larger size.`);
    }
  } else {
    for (let i = 0; i < planned.length; i++) {
      check();
      onProgress?.({ done: i, total: planned.length });
      made.push(await makePart(src, (planned[i] as PlannedPart).pages, kept));
    }
  }
  onProgress?.({ done: 1, total: 1 });

  const pad = String(planned.length).length;
  const parts = planned.map((part, i) => ({
    name: `${base}-${String(i + 1).padStart(pad, "0")}${part.slug ? `-${part.slug}` : ""}.pdf`,
    data: made[i] as Uint8Array,
    pages: part.pages.map((p) => p + 1),
    ...(part.label ? { label: part.label } : {}),
  }));
  return { parts, oversized };
}

/** The document's bookmarks, for showing what a split by bookmarks will do. */
export async function readBookmarks(bytes: Uint8Array): Promise<OutlineItem[]> {
  return readOutline(await loadPdf(bytes));
}
