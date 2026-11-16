/**
 * Insert pages into a PDF (blank pages, or pages of another PDF, at any gaps between pages) and mix several PDFs
 * page by page (Alternate & Mix: the fronts and backs of a one-sided scan, put back in reading order).
 *
 * Both only decide the page order; `mergeDocuments` makes the file, so bookmarks, links and fillable forms come
 * along, and the first file's title, author and language are kept.
 */
import { mergeDocuments, type MergeEntry, type MergeFile } from "./pdf-merge";
import { PdfError } from "./pdf";

/**
 * A gap between pages, numbered from 0 (before the first page) to the page count (after the last). Gap `k` is
 * after page `k` counting from 1, so "after page 3" is gap 3.
 */
export type Gap = number;

/** Gaps after every `every` pages: after pages every, 2·every, … and after the last page when it ends a group. */
export function gapsEvery(pageCount: number, every: number): Gap[] {
  const n = Math.floor(every);
  if (!(n >= 1)) throw new PdfError("Choose how many pages go between insertions (1 or more).");
  const out: Gap[] = [];
  for (let g = n; g <= pageCount; g += n) out.push(g);
  return out;
}

/** Gaps in order, each once, inside 0…pageCount. */
export function cleanGaps(gaps: readonly Gap[], pageCount: number): Gap[] {
  return [...new Set(gaps.filter((g) => Number.isInteger(g) && g >= 0 && g <= pageCount))].sort((a, b) => a - b);
}

/** What to put in each gap: some blank pages, or pages of a second file (file 1 of the merge). */
export type Insertion =
  | { blank: { count: number; size?: { width: number; height: number } } }
  | { pages: readonly number[] };

/** The pages put into one gap. A blank without its own size takes the size and turn of the page next to it. */
function insertionAt(gap: Gap, insertion: Insertion): MergeEntry[] {
  if ("pages" in insertion) return insertion.pages.map((page) => ({ file: 1, page }));
  const { count, size } = insertion.blank;
  const like = { file: 0, page: Math.max(gap - 1, 0) };
  return Array.from({ length: count }, () => (size ? { blank: true as const, size } : { blank: true as const, like }));
}

export interface InsertPlan {
  sequence: MergeEntry[];
  /** Positions (zero-based) of the inserted pages in the result. */
  inserted: number[];
}

/** The page order after inserting into each gap. The document is file 0. */
export function insertSequence(pageCount: number, gaps: readonly Gap[], insertion: Insertion): InsertPlan {
  const at = new Set(cleanGaps(gaps, pageCount));
  const sequence: MergeEntry[] = [];
  const inserted: number[] = [];
  const add = (gap: Gap) => {
    if (!at.has(gap)) return;
    for (const entry of insertionAt(gap, insertion)) {
      inserted.push(sequence.length);
      sequence.push(entry);
    }
  };
  for (let page = 0; page < pageCount; page++) {
    add(page);
    sequence.push({ file: 0, page });
  }
  add(pageCount);
  return { sequence, inserted };
}

export const MAX_BLANKS_PER_GAP = 50;

export interface InsertOptions {
  gaps: readonly Gap[];
  /** Blank pages to add at each gap, or the pages of `from` to add. */
  insertion: Insertion;
  /** The PDF whose pages are inserted, when `insertion` has pages. */
  from?: MergeFile;
}

export interface InsertResult {
  data: Uint8Array;
  pages: number;
  inserted: number;
  renamedFields: number;
}

export async function insertPages(document: MergeFile & { pageCount: number }, options: InsertOptions): Promise<InsertResult> {
  const { insertion } = options;
  const gaps = cleanGaps(options.gaps, document.pageCount);
  if (gaps.length === 0) throw new PdfError("Choose where to insert the pages.");
  if ("blank" in insertion) {
    const { count, size } = insertion.blank;
    if (!Number.isInteger(count) || count < 1 || count > MAX_BLANKS_PER_GAP) throw new PdfError(`Insert between 1 and ${MAX_BLANKS_PER_GAP} blank pages at a time.`);
    if (size && !(size.width >= 36 && size.height >= 36 && size.width <= 14400 && size.height <= 14400)) throw new PdfError("Choose a page size between 0.5 inch (13 mm) and 200 inches on each side.");
  } else {
    if (!options.from) throw new PdfError("Add the PDF whose pages you want to insert.");
    if (insertion.pages.length === 0) throw new PdfError("Choose at least one page to insert.");
  }
  const plan = insertSequence(document.pageCount, gaps, insertion);
  const files = options.from ? [document, options.from] : [document];
  const result = await mergeDocuments(files, plan.sequence, { keepBookmarks: true, bookmarkPerFile: false, keepForms: true, infoFrom: 0 });
  return { data: result.data, pages: result.pages, inserted: plan.inserted.length, renamedFields: result.renamedFields };
}

/* ----------------------------------------------------------------------------------------------- */
/* Alternate & Mix                                                                                  */
/* ----------------------------------------------------------------------------------------------- */

export interface MixSource {
  /** Which file the pages come from. The source's own position when absent, so one file can feed two sources. */
  file?: number;
  pageCount: number;
  /** Zero-based pages to take, in order. All pages when absent. */
  pages?: readonly number[];
  /** Take the pages last to first (backs scanned in reverse order). */
  reverse?: boolean;
  /** Pages to take from this file each turn. 1 by default. */
  take?: number;
}

/** The pages each file gives, in the order it gives them. */
export function mixLists(sources: readonly MixSource[]): number[][] {
  return sources.map((s) => {
    const pages = s.pages ? [...s.pages] : Array.from({ length: s.pageCount }, (_, i) => i);
    return s.reverse ? pages.reverse() : pages;
  });
}

/**
 * Takes `take` pages from each file in turn until every file has run out. A file that runs out is skipped, so the
 * rest of a longer file comes at the end.
 */
export function alternateSequence(sources: readonly MixSource[]): MergeEntry[] {
  const lists = mixLists(sources);
  const at = lists.map(() => 0);
  const out: MergeEntry[] = [];
  for (;;) {
    let moved = false;
    lists.forEach((list, file) => {
      const take = Math.max(1, Math.floor(sources[file]?.take ?? 1));
      for (let k = 0; k < take && (at[file] as number) < list.length; k++) {
        out.push({ file: sources[file]?.file ?? file, page: list[at[file] as number] as number });
        at[file] = (at[file] as number) + 1;
        moved = true;
      }
    });
    if (!moved) return out;
  }
}

/**
 * The two halves of a single file holding every front, then every back: fronts are the first ceil(n/2) pages and
 * backs the rest. Mixing them (backs reversed when the scanner fed them last to first) restores the reading order.
 */
export function halves(pageCount: number): { fronts: number[]; backs: number[] } {
  const split = Math.ceil(pageCount / 2);
  return { fronts: Array.from({ length: split }, (_, i) => i), backs: Array.from({ length: pageCount - split }, (_, i) => split + i) };
}

export interface MixResult {
  data: Uint8Array;
  pages: number;
  renamedFields: number;
}

export async function alternatePdfs(files: readonly MergeFile[], sources: readonly MixSource[]): Promise<MixResult> {
  if (sources.some((s, i) => !files[s.file ?? i])) throw new PdfError("A file to mix is missing.");
  const sequence = alternateSequence(sources);
  if (sequence.length === 0) throw new PdfError("There are no pages to mix.");
  const result = await mergeDocuments(files, sequence, { keepBookmarks: true, bookmarkPerFile: false, keepForms: true, infoFrom: 0 });
  return { data: result.data, pages: result.pages, renamedFields: result.renamedFields };
}
