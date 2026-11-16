/**
 * Merge PDFs page by page: any pages of any files in any order, each turned if wanted, with blank pages where a
 * double-sided print needs them. The merged file can get a bookmark per file (with each file's own bookmarks inside),
 * and keeps working form fields: pdf-lib copies the field widgets with the pages but not the form itself, so the form
 * is rebuilt here, and fields that share a name across files are renamed so filling one does not fill the other.
 */
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObjectCopier, PDFPage, PDFRef, PDFString, degrees, type PDFPageLeaf } from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";
import { plainView, readOutline, writeOutline, type NewOutlineItem, type OutlineItem } from "./pdf-outline";

export interface MergeFile {
  bytes: Uint8Array;
  name: string;
}

/**
 * One page of the result: a page of a file (zero-based), turned by a multiple of 90° clockwise, or a blank page.
 * A blank page has its own `size` (in points, upright), takes the size and turn of the page `like` names, or
 * otherwise copies the page before it.
 */
export type MergeEntry = { file: number; page: number; turn?: number } | { blank: true; size?: { width: number; height: number }; like?: { file: number; page: number } };

export interface MergeOptions {
  /** A bookmark at the first page of each file, named after the file. */
  bookmarkPerFile?: boolean;
  /** Keep each file's own bookmarks (inside its file bookmark when there is one). */
  keepBookmarks?: boolean;
  /** Keep form fields fillable. On by default. */
  keepForms?: boolean;
  /** Copy the title, author, subject, keywords, creator and language of this file to the result. */
  infoFrom?: number;
}

export interface MergeResult {
  data: Uint8Array;
  pages: number;
  blanks: number;
  /** Form fields renamed because another file had a field with the same name. */
  renamedFields: number;
}

/**
 * The pages of each file in order, file after file. `pages` per file are zero-based indexes (all pages when absent).
 * With `startOnRightHand`, a blank page follows any file that ends on a left-hand page (except the last), so every file
 * starts on the front of a sheet when printed double-sided.
 */
export function sequenceFromFiles(files: readonly { pageCount: number; pages?: readonly number[] }[], startOnRightHand = false): MergeEntry[] {
  const out: MergeEntry[] = [];
  files.forEach((f, file) => {
    const pages = f.pages ?? Array.from({ length: f.pageCount }, (_, i) => i);
    for (const page of pages) out.push({ file, page });
    const printed = out.length;
    if (startOnRightHand && file < files.length - 1 && pages.length > 0 && printed % 2 === 1) out.push({ blank: true });
  });
  return out;
}

const baseTitle = (name: string) => name.replace(/\.pdf$/i, "").trim() || "Untitled";

export async function mergeDocuments(files: readonly MergeFile[], sequence: readonly MergeEntry[], options: MergeOptions = {}): Promise<MergeResult> {
  const { bookmarkPerFile = false, keepBookmarks = true, keepForms = true } = options;
  if (sequence.filter((e) => !("blank" in e)).length === 0) throw new PdfError("There are no pages to merge.");
  const used = [...new Set([...sequence.flatMap((e) => ("blank" in e ? (e.like ? [e.like.file] : []) : [e.file])), ...(options.infoFrom === undefined ? [] : [options.infoFrom])])].sort((a, b) => a - b);
  const sources = new Map<number, PDFDocument>();
  for (const i of used) {
    const f = files[i];
    if (!f) throw new PdfError(`File ${i + 1} is missing.`);
    sources.set(i, await loadPdf(f.bytes, `${f.name}`));
  }

  const merged = await PDFDocument.create();
  // Copy each file's pages in one go, so pages that share fonts, pictures or form fields share one copy of them.
  const copies = new Map<string, PDFPage[]>();
  // Pages used more than once that have no links, fields or comments: later uses share the first copy's content
  // and resources (a new page object pointing at them), so a page repeated 100 times is stored once.
  const templates = new Map<string, PDFPageLeaf>();
  const batches = new Map<number, PDFPage[][]>();
  for (const [file, doc] of sources) {
    const count = doc.getPageCount();
    const wanted: number[][] = [];
    const check = (page: number) => {
      if (!Number.isInteger(page) || page < 0 || page >= count) throw new PdfError(`${files[file]?.name} has no page ${page + 1} (it has ${count}).`);
    };
    for (const e of sequence) {
      if ("blank" in e) {
        if (e.like?.file === file) check(e.like.page);
        continue;
      }
      if (e.file !== file) continue;
      check(e.page);
      const plain = !hasAnnotations(doc.getPage(e.page).node);
      if (plain && wanted[0]?.includes(e.page)) continue;
      // A page with annotations used twice needs a second copy, so each copy has its own fields and links.
      let round = wanted.find((r) => !r.includes(e.page));
      if (!round) wanted.push((round = []));
      round.push(e.page);
    }
    const fileBatches: PDFPage[][] = [];
    for (const round of wanted) {
      const pages = await merged.copyPages(doc, round);
      fileBatches.push(pages);
      round.forEach((p, k) => {
        const key = `${file}:${p}`;
        const page = pages[k] as PDFPage;
        copies.set(key, [...(copies.get(key) ?? []), page]);
        if (!templates.has(key) && !hasAnnotations(page.node)) {
          // Resources written inline would be repeated in every reuse; one shared object is enough.
          const resources = page.node.get(PDFName.of("Resources"));
          if (resources instanceof PDFDict) page.node.set(PDFName.of("Resources"), merged.context.register(resources));
          templates.set(key, page.node.clone());
        }
      });
    }
    batches.set(file, fileBatches);
  }
  const reuse = (key: string): PDFPage | undefined => {
    const template = templates.get(key);
    if (!template) return undefined;
    const node = template.clone();
    return PDFPage.of(node, merged.context.register(node), merged);
  };

  const firstOut = new Map<string, PDFRef>();
  const fileStart = new Map<number, PDFRef>();
  let blanks = 0;
  let last: PDFPage | null = null;
  for (const e of sequence) {
    if ("blank" in e) {
      const like = e.like ? (sources.get(e.like.file) as PDFDocument).getPage(e.like.page) : e.size ? null : last;
      const size = e.size ?? (like ? like.getSize() : { width: 612, height: 792 });
      const page = merged.addPage([size.width, size.height]);
      if (like) page.setRotation(degrees(like.getRotation().angle));
      blanks++;
      last = page;
      continue;
    }
    const key = `${e.file}:${e.page}`;
    const page = copies.get(key)?.shift() ?? reuse(key);
    if (!page) throw new PdfError("A page could not be copied.");
    const turn = (((Math.round((e.turn ?? 0) / 90) * 90) % 360) + 360) % 360;
    if (turn) page.setRotation(degrees((page.getRotation().angle + turn) % 360));
    merged.addPage(page);
    if (!firstOut.has(key)) firstOut.set(key, page.ref);
    if (!fileStart.has(e.file)) fileStart.set(e.file, page.ref);
    last = page;
  }

  // Bookmarks.
  if (bookmarkPerFile || keepBookmarks) {
    const tree: NewOutlineItem[] = [];
    const order = [...fileStart.keys()];
    for (const file of order) {
      const doc = sources.get(file) as PDFDocument;
      const own = keepBookmarks ? mapOutline(readOutline(doc), (p) => firstOut.get(`${file}:${p}`) ?? null) : [];
      if (bookmarkPerFile) tree.push({ title: baseTitle(files[file]?.name ?? ""), pageRef: fileStart.get(file) ?? null, children: own, closed: own.length > 0 });
      else tree.push(...own);
    }
    writeOutline(merged, tree);
  }

  const renamedFields = keepForms ? mergeForms(merged, sources, batches) : 0;
  const infoSource = options.infoFrom === undefined ? undefined : sources.get(options.infoFrom);
  if (infoSource) copyInfo(infoSource, merged);
  const data = await merged.save({ useObjectStreams: true });
  return { data, pages: sequence.length, blanks, renamedFields };
}

/** Whether a page has links, fields or comments (pdf-lib gives new pages an empty Annots array). */
function hasAnnotations(node: PDFPageLeaf): boolean {
  const annots = node.lookup(PDFName.of("Annots"));
  return annots instanceof PDFArray && annots.size() > 0;
}

/** The document details a reader shows, from one file to another. */
export function copyInfo(from: PDFDocument, to: PDFDocument): void {
  const title = from.getTitle();
  if (title) to.setTitle(title);
  const author = from.getAuthor();
  if (author) to.setAuthor(author);
  const subject = from.getSubject();
  if (subject) to.setSubject(subject);
  const keywords = from.getKeywords();
  if (keywords) to.setKeywords([keywords]);
  const creator = from.getCreator();
  if (creator) to.setCreator(creator);
  const lang = from.catalog.lookup(PDFName.of("Lang"));
  if (lang instanceof PDFString || lang instanceof PDFHexString) to.catalog.set(PDFName.of("Lang"), PDFString.of(lang.decodeText()));
}

function mapOutline(items: OutlineItem[], pageRef: (page: number) => PDFRef | null): NewOutlineItem[] {
  return items.map((it) => ({ title: it.title, pageRef: it.page === null ? null : pageRef(it.page), view: plainView(it.view), children: mapOutline(it.children, pageRef) }));
}

/* ----------------------------------------------------------------------------------------------- */
/* Form fields                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

const fieldName = (dict: PDFDict) => {
  const t = dict.lookup(PDFName.of("T"));
  return t instanceof PDFString || t instanceof PDFHexString ? t.decodeText() : "";
};

/** Rebuild the form of the merged file from the fields whose widgets came across with the pages. Returns how many fields were renamed. */
function mergeForms(merged: PDFDocument, sources: Map<number, PDFDocument>, batches: Map<number, PDFPage[][]>): number {
  const context = merged.context;
  const fields: PDFRef[] = [];
  const names = new Set<string>();
  let renamed = 0;
  let da: PDFObjectLike | undefined;
  let needAppearances = false;
  const dr = context.obj({});
  const drFonts = context.obj({});

  for (const [file, doc] of sources) {
    const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
    if (!form) continue;
    const copier = PDFObjectCopier.for(doc.context, context);
    const ownDa = form.get(PDFName.of("DA"));
    if (!da && ownDa) da = copier.copy(ownDa);
    if (form.lookup(PDFName.of("NeedAppearances")) === PDFBool.True) needAppearances = true;
    const fonts = form.lookupMaybe(PDFName.of("DR"), PDFDict)?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (fonts) {
      for (const [key, value] of fonts.entries()) if (!drFonts.has(key)) drFonts.set(key, copier.copy(value));
    }

    for (const pages of batches.get(file) ?? []) {
      const roots = new Map<string, PDFRef>();
      for (const page of pages) {
        const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
        if (!annots) continue;
        for (let i = 0; i < annots.size(); i++) {
          let ref: PDFObjectLike = annots.get(i);
          const widget = context.lookup(ref);
          if (!(widget instanceof PDFDict) || widget.lookup(PDFName.of("Subtype")) !== PDFName.of("Widget")) continue;
          let dict: PDFDict = widget;
          // Climb to the field at the top of the tree.
          for (let depth = 0; depth < 32; depth++) {
            const parent: PDFObjectLike = dict.get(PDFName.of("Parent"));
            const parentDict: unknown = parent ? context.lookup(parent) : undefined;
            if (!(parent instanceof PDFRef) || !(parentDict instanceof PDFDict)) break;
            ref = parent;
            dict = parentDict;
          }
          if (ref instanceof PDFRef) roots.set(ref.toString(), ref);
        }
      }
      for (const ref of roots.values()) {
        const dict = context.lookup(ref, PDFDict);
        const name = fieldName(dict);
        if (name) {
          let unique = name;
          for (let n = 2; names.has(unique); n++) unique = `${name}_${n}`;
          if (unique !== name) {
            dict.set(PDFName.of("T"), PDFHexString.fromText(unique));
            renamed++;
          }
          names.add(unique);
        }
        fields.push(ref);
      }
    }
  }
  if (fields.length === 0) return 0;
  const acro = context.obj({});
  acro.set(PDFName.of("Fields"), context.obj(fields));
  if (drFonts.keys().length > 0) {
    dr.set(PDFName.of("Font"), drFonts);
    acro.set(PDFName.of("DR"), dr);
  }
  if (da) acro.set(PDFName.of("DA"), da as never);
  if (needAppearances) acro.set(PDFName.of("NeedAppearances"), PDFBool.True);
  merged.catalog.set(PDFName.of("AcroForm"), context.register(acro));
  return renamed;
}

type PDFObjectLike = ReturnType<PDFDict["get"]>;
