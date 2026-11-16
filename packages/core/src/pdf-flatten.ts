/**
 * Flatten a PDF: draw form fields, comments, highlights and stamps into the page content, exactly as they show,
 * then remove the interactive layer, so the file looks the same in every reader and can no longer be filled in or
 * edited as annotations. Objects nothing refers to any more (the old fields, their values and scripts) are dropped.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFStream, PDFString, type PDFObject } from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";
import { drawAppearance } from "./pdf-layout";

const HIDDEN = 1 << 1;
const NO_VIEW = 1 << 5;

/** What a reader would call each kind of annotation, grouped. */
export const COMMENT_KINDS = ["highlights", "notes", "text boxes", "stamps", "drawings", "shapes", "attached files", "other marks"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

function kindOf(subtype: string): CommentKind {
  switch (subtype) {
    case "Highlight":
    case "Underline":
    case "StrikeOut":
    case "Squiggly":
      return "highlights";
    case "Text":
      return "notes";
    case "FreeText":
      return "text boxes";
    case "Stamp":
      return "stamps";
    case "Ink":
      return "drawings";
    case "Square":
    case "Circle":
    case "Line":
    case "Polygon":
    case "PolyLine":
      return "shapes";
    case "FileAttachment":
      return "attached files";
    default:
      return "other marks";
  }
}

export interface FlattenReport {
  pages: number;
  /** Form fields (counted once, however many boxes they have on the pages). */
  fields: number;
  /** Fields with a value filled in. */
  filledFields: number;
  /** Signature fields, and how many of them are signed. */
  signatures: number;
  signed: number;
  /** Comments and marks by kind (popups are part of their comment, links are counted apart). */
  comments: Partial<Record<CommentKind, number>>;
  commentTotal: number;
  links: number;
  /** The form also has an XFA version, which some readers show instead of the fields. */
  xfa: boolean;
}

const subtypeOf = (annot: PDFDict) => annot.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText() ?? "";

/** The top field a widget belongs to (the widget itself when it is the whole field). */
function fieldRoot(doc: PDFDocument, ref: PDFObject | undefined): PDFObject | undefined {
  let current = ref;
  for (let depth = 0; depth < 32; depth++) {
    const dict = current instanceof PDFRef ? doc.context.lookup(current) : current;
    if (!(dict instanceof PDFDict)) return current;
    const parent = dict.get(PDFName.of("Parent"));
    if (!(parent instanceof PDFRef) || !(doc.context.lookup(parent) instanceof PDFDict)) return current;
    current = parent;
  }
  return current;
}

function hasValue(doc: PDFDocument, node: PDFDict, depth = 0): boolean {
  if (depth > 32) return false;
  const v = node.lookup(PDFName.of("V"));
  if (v instanceof PDFString || v instanceof PDFHexString) {
    if (v.decodeText().trim() !== "") return true;
  } else if (v instanceof PDFName) {
    if (v.decodeText() !== "Off") return true;
  } else if (v instanceof PDFArray) {
    if (v.size() > 0) return true;
  } else if (v instanceof PDFDict) return true;
  const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
  if (kids) for (let i = 0; i < kids.size(); i++) {
    const kid = kids.lookupMaybe(i, PDFDict);
    if (kid && hasValue(doc, kid, depth + 1)) return true;
  }
  return false;
}

const fieldType = (node: PDFDict): string | undefined => {
  let current: PDFDict | undefined = node;
  for (let depth = 0; current && depth < 32; depth++) {
    const ft = current.lookupMaybe(PDFName.of("FT"), PDFName);
    if (ft) return ft.decodeText();
    current = current.lookupMaybe(PDFName.of("Parent"), PDFDict);
  }
  return undefined;
};

export function inspectDocument(doc: PDFDocument): FlattenReport {
  const report: FlattenReport = { pages: doc.getPageCount(), fields: 0, filledFields: 0, signatures: 0, signed: 0, comments: {}, commentTotal: 0, links: 0, xfa: false };
  const roots = new Set<string>();
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      const subtype = subtypeOf(annot);
      if (subtype === "Popup") continue;
      if (subtype === "Link") {
        report.links++;
        continue;
      }
      if (subtype === "Widget") {
        const root = fieldRoot(doc, raw);
        const key = root instanceof PDFRef ? root.toString() : `direct:${roots.size}`;
        if (roots.has(key)) continue;
        roots.add(key);
        const rootDict = root instanceof PDFRef ? doc.context.lookup(root, PDFDict) : annot;
        report.fields++;
        const filled = hasValue(doc, rootDict);
        if (filled) report.filledFields++;
        if (fieldType(annot) === "Sig") {
          report.signatures++;
          if (filled) report.signed++;
        }
        continue;
      }
      const kind = kindOf(subtype);
      report.comments[kind] = (report.comments[kind] ?? 0) + 1;
      report.commentTotal++;
    }
  }
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  report.xfa = !!form?.has(PDFName.of("XFA"));
  return report;
}

/** What is in a PDF that flattening would change. */
export async function inspectFlatten(bytes: Uint8Array): Promise<FlattenReport> {
  return inspectDocument(await loadPdf(bytes));
}

export interface FlattenOptions {
  /** Draw form fields into the pages and remove the form. Default true. */
  forms?: boolean;
  /** Draw comments, highlights, stamps and drawings into the pages and remove them as comments. Default true. */
  comments?: boolean;
  /** Remove links too (they draw nothing, so there is nothing to keep of them). Default false. */
  removeLinks?: boolean;
}

export interface FlattenResult {
  data: Uint8Array;
  /** Fields and comments drawn into the pages. */
  fields: number;
  comments: number;
  /** Visible annotations that had no picture to draw (a reader would draw its own icon); they are removed. */
  withoutPicture: number;
  links: number;
  /** Objects left over that nothing refers to any more, dropped from the file. */
  dropped: number;
}

export async function flattenPdf(bytes: Uint8Array, options: FlattenOptions = {}): Promise<FlattenResult> {
  const { forms = true, comments = true, removeLinks = false } = options;
  if (!forms && !comments && !removeLinks) throw new PdfError("Choose what to flatten.");
  const doc = await loadPdf(bytes);
  const before = inspectDocument(doc);
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (forms && form) {
    try {
      // Values set by a viewer that only flagged NeedAppearances have no picture yet; make one first.
      doc.getForm().updateFieldAppearances();
    } catch {
      // A field with an unusual font keeps the picture it has.
    }
  }

  let drawnBoxes = 0;
  let commentCount = 0;
  let withoutPicture = 0;
  let links = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    const kept: PDFObject[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      const subtype = subtypeOf(annot);
      const flatten = subtype === "Widget" ? forms : comments;
      if (subtype === "Link") {
        if (removeLinks) links++;
        else kept.push(raw);
        continue;
      }
      if (!flatten) {
        kept.push(raw);
        continue;
      }
      if (subtype === "Popup") continue;
      const flags = annot.lookupMaybe(PDFName.of("F"), PDFNumber)?.asNumber() ?? 0;
      if (!(flags & (HIDDEN | NO_VIEW))) {
        if (drawAppearance(doc, page, annot)) {
          if (subtype === "Widget") drawnBoxes++;
          else commentCount++;
        } else if (subtype !== "Widget") withoutPicture++;
      }
    }
    if (kept.length) page.node.set(PDFName.of("Annots"), doc.context.obj(kept));
    else page.node.delete(PDFName.of("Annots"));
  }
  if (forms) doc.catalog.delete(PDFName.of("AcroForm"));

  await doc.flush();
  const dropped = removeUnusedObjects(doc);
  const data = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  // Fields are counted once each, not once per box: a field shown on three pages is one field.
  return { data, fields: forms && drawnBoxes > 0 ? before.fields : 0, comments: commentCount, withoutPicture, links, dropped };
}

/**
 * Deletes every object that cannot be reached from the document catalog or its info dictionary. pdf-lib writes
 * all objects it holds, so without this the removed fields, values and scripts would still be in the file.
 */
export function removeUnusedObjects(doc: PDFDocument): number {
  const context = doc.context;
  const reached = new Set<string>();
  const queue: PDFObject[] = [];
  const roots = [context.trailerInfo.Root, context.trailerInfo.Info, context.trailerInfo.Encrypt, context.trailerInfo.ID];
  for (const root of roots) if (root) queue.push(root);
  while (queue.length) {
    const object = queue.pop() as PDFObject;
    if (object instanceof PDFRef) {
      const key = object.toString();
      if (reached.has(key)) continue;
      reached.add(key);
      const target = context.lookup(object);
      if (target) queue.push(target);
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) queue.push(value);
    } else if (object instanceof PDFStream) {
      for (const [, value] of object.dict.entries()) queue.push(value);
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) queue.push(object.get(i));
    }
  }
  let dropped = 0;
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (reached.has(ref.toString())) continue;
    context.delete(ref);
    dropped++;
  }
  return dropped;
}
