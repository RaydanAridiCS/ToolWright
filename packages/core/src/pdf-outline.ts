/**
 * Bookmarks (the PDF "outline"): read them from a document, and write a new tree of them. Used by Merge PDF (a
 * bookmark per file, keeping each file's own) and Split PDF (one file per bookmark).
 *
 * A bookmark points at a page in one of several ways: a /Dest array, a named destination (looked up in the
 * catalog's /Names /Dests tree or the older /Dests dictionary), or a /GoTo action holding either. All are read; a
 * bookmark whose target cannot be found keeps its title and has no page. Keep this file free of the DOM.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, PDFString, type PDFDocument, type PDFObject } from "pdf-lib";

export interface OutlineItem {
  title: string;
  /** Zero-based page index, or null when the target is missing or on another file. */
  page: number | null;
  /** The rest of the destination after the page (such as /XYZ left top zoom), so a copied bookmark opens at the same spot. */
  view: PDFObject[];
  children: OutlineItem[];
}

const MAX_ITEMS = 20000;

function text(obj: PDFObject | undefined): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  if (obj instanceof PDFName) return obj.decodeText();
  return "";
}

/** Look a name up in a name tree (/Names arrays and /Kids). */
function lookupNameTree(doc: PDFDocument, node: PDFDict | undefined, name: string, depth = 0): PDFObject | undefined {
  if (!node || depth > 32) return undefined;
  const names = node.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) if (text(names.lookup(i)) === name) return names.lookup(i + 1);
  }
  const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (!(kid instanceof PDFDict)) continue;
      const limits = kid.lookupMaybe(PDFName.of("Limits"), PDFArray);
      if (limits && limits.size() === 2) {
        const lo = text(limits.lookup(0));
        const hi = text(limits.lookup(1));
        if (name < lo || name > hi) continue;
      }
      const found = lookupNameTree(doc, kid, name, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** The destination array a bookmark, link or action points at, following named destinations. */
export function resolveDestination(doc: PDFDocument, dest: PDFObject | undefined): PDFArray | undefined {
  const target = dest instanceof PDFRef ? doc.context.lookup(dest) : dest;
  if (target instanceof PDFArray) return target;
  if (target instanceof PDFDict) {
    // A named destination's value may be a dictionary holding /D.
    const d = target.lookup(PDFName.of("D"));
    return d instanceof PDFArray ? d : undefined;
  }
  const name = text(target);
  if (!name) return undefined;
  const catalog = doc.catalog;
  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of("Dests"), PDFDict);
  let found = lookupNameTree(doc, tree, name);
  if (!found) found = catalog.lookupMaybe(PDFName.of("Dests"), PDFDict)?.lookup(PDFName.of(name));
  if (found instanceof PDFArray) return found;
  if (found instanceof PDFDict) {
    const d = found.lookup(PDFName.of("D"));
    return d instanceof PDFArray ? d : undefined;
  }
  return undefined;
}

function itemDestination(doc: PDFDocument, item: PDFDict): PDFArray | undefined {
  const dest = item.get(PDFName.of("Dest"));
  if (dest) return resolveDestination(doc, dest);
  const action = item.lookupMaybe(PDFName.of("A"), PDFDict);
  if (action && action.lookup(PDFName.of("S")) === PDFName.of("GoTo")) return resolveDestination(doc, action.get(PDFName.of("D")));
  return undefined;
}

/** The document's bookmarks as a tree. Empty when it has none. */
export function readOutline(doc: PDFDocument): OutlineItem[] {
  const outlines = doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
  if (!outlines) return [];
  const pageIndex = new Map<string, number>();
  doc.getPages().forEach((p, i) => pageIndex.set(p.ref.toString(), i));
  const seen = new Set<PDFDict>();
  let count = 0;

  const walk = (first: PDFObject | undefined, depth: number): OutlineItem[] => {
    const out: OutlineItem[] = [];
    let node = first instanceof PDFRef ? doc.context.lookup(first) : first;
    while (node instanceof PDFDict && !seen.has(node) && count < MAX_ITEMS && depth < 64) {
      seen.add(node);
      count++;
      const dest = itemDestination(doc, node);
      let page: number | null = null;
      const view: PDFObject[] = [];
      if (dest && dest.size() > 0) {
        const target = dest.get(0);
        if (target instanceof PDFRef) page = pageIndex.get(target.toString()) ?? null;
        for (let i = 1; i < dest.size(); i++) view.push(dest.get(i));
      }
      out.push({ title: text(node.lookup(PDFName.of("Title"))).trim(), page, view, children: walk(node.get(PDFName.of("First")), depth + 1) });
      node = node.lookup(PDFName.of("Next"));
    }
    return out;
  };
  return walk(outlines.get(PDFName.of("First")), 0);
}

/** A bookmark to write: `pageRef` is the page in the document being written. */
export interface NewOutlineItem {
  title: string;
  pageRef: PDFRef | null;
  view?: PDFObject[];
  children: NewOutlineItem[];
  /** Shown closed (children hidden) in the reader's bookmark panel. */
  closed?: boolean;
}

/** Number of items below `item` that are visible when the tree is opened as written. */
function visibleCount(items: NewOutlineItem[]): number {
  return items.reduce((n, it) => n + 1 + (it.closed ? 0 : visibleCount(it.children)), 0);
}

/** Replace the document's bookmarks with `items`. Bookmarks with no page and no children are left out. */
export function writeOutline(doc: PDFDocument, items: NewOutlineItem[]): void {
  const prune = (list: NewOutlineItem[]): NewOutlineItem[] =>
    list.flatMap((it) => {
      const children = prune(it.children);
      if (!it.pageRef && children.length === 0) return [];
      return [{ ...it, children, pageRef: it.pageRef ?? firstPage(children) }];
    });
  const firstPage = (list: NewOutlineItem[]): PDFRef | null => {
    for (const it of list) {
      if (it.pageRef) return it.pageRef;
      const inner = firstPage(it.children);
      if (inner) return inner;
    }
    return null;
  };
  const tree = prune(items);
  const context = doc.context;
  if (tree.length === 0) {
    doc.catalog.delete(PDFName.of("Outlines"));
    return;
  }
  const rootRef = context.nextRef();
  const build = (list: NewOutlineItem[], parent: PDFRef): { first: PDFRef; last: PDFRef } => {
    const refs = list.map(() => context.nextRef());
    list.forEach((it, i) => {
      const dict = context.obj({});
      dict.set(PDFName.of("Title"), PDFHexString.fromText(it.title || "Untitled"));
      dict.set(PDFName.of("Parent"), parent);
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1] as PDFRef);
      if (i < list.length - 1) dict.set(PDFName.of("Next"), refs[i + 1] as PDFRef);
      if (it.pageRef) {
        const view = it.view && it.view.length ? it.view : [PDFName.of("Fit")];
        dict.set(PDFName.of("Dest"), context.obj([it.pageRef, ...view]));
      }
      if (it.children.length) {
        const inner = build(it.children, refs[i] as PDFRef);
        dict.set(PDFName.of("First"), inner.first);
        dict.set(PDFName.of("Last"), inner.last);
        const n = visibleCount(it.children);
        dict.set(PDFName.of("Count"), PDFNumber.of(it.closed ? -n : n));
      }
      context.assign(refs[i] as PDFRef, dict);
    });
    return { first: refs[0] as PDFRef, last: refs[refs.length - 1] as PDFRef };
  };
  const top = build(tree, rootRef);
  const root = context.obj({});
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), top.first);
  root.set(PDFName.of("Last"), top.last);
  root.set(PDFName.of("Count"), PDFNumber.of(visibleCount(tree)));
  context.assign(rootRef, root);
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

/** View entries are numbers, names and null; copy them as they are (they hold no references). */
export const plainView = (view: PDFObject[]): PDFObject[] => view.filter((v) => v instanceof PDFNumber || v instanceof PDFName || v === PDFNull);

/** A file name made from a bookmark title: letters, digits and dashes, at most 60 characters. */
export function fileNameFromTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")
    .toLowerCase();
  return slug || "part";
}
