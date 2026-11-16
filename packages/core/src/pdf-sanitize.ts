/**
 * Sanitize a PDF: find and remove what a document can carry besides its pages. Scripts and the actions that run
 * them, actions that open files or send data, attached files, metadata (document details, XMP, applications'
 * private data, camera data inside photos, the file ID), content on hidden layers, and optionally comments, form
 * fields and web links. The file is written again from scratch, so earlier saved versions and anything no longer
 * used are left out.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, type PDFObject } from "pdf-lib";
import { loadPdf, PdfError } from "./pdf";
import { decodeStream, filtersOf, latin1, readToken, toBytes, unescapeName, type Token } from "./pdf-content";
import { flattenPdf, removeUnusedObjects } from "./pdf-flatten";

export interface SanitizeOptions {
  /** JavaScript, wherever it is. Default true. */
  scripts?: boolean;
  /** Actions that launch programs, open other files, send form data or play media. Default true. */
  actions?: boolean;
  /** Attached (embedded) files. Default true. */
  attachments?: boolean;
  /** Document details, XMP, applications' private data, photo camera data and the file ID. Default true. */
  metadata?: boolean;
  /** Content on layers that are hidden when the file opens. Default true. */
  hiddenLayers?: boolean;
  /** Comments, highlights, stamps and drawings. Default false. */
  comments?: boolean;
  /** Form fields, flattened so their answers stay on the page. Default false. */
  forms?: boolean;
  /** Links to websites (links inside the document stay). Default false. */
  webLinks?: boolean;
}

export interface SanitizeFindings {
  scripts: number;
  actions: number;
  attachments: number;
  /** Names of the attached files (the first 20). */
  attachmentNames: string[];
  /** Document details that have a value, such as Author or Producer. */
  info: string[];
  xmp: number;
  privateData: number;
  photosWithData: number;
  fileId: boolean;
  layers: number;
  hiddenLayers: number;
  comments: number;
  formFields: number;
  webLinks: number;
  thumbnails: number;
  /** Earlier saved versions kept inside the file (incremental updates). */
  earlierVersions: number;
}

export interface SanitizeResult {
  data: Uint8Array;
  /** What was found in the original, for the categories that were cleaned. */
  removed: Partial<SanitizeFindings>;
  /** Hidden-layer drawing operations taken out of page content. */
  hiddenContent: number;
  /** Objects nothing referred to any more, left out of the new file. */
  dropped: number;
}

/* ----------------------------------------------------------------------------------------------- */

const SCRIPT = "JavaScript";
const RISKY = new Set(["Launch", "SubmitForm", "ImportData", "GoToR", "GoToE", "Rendition", "Movie", "Sound", "RichMediaExecute"]);
const nameOf = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);
const text = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : "");

interface ActionKinds {
  script: boolean;
  risky: boolean;
  web: boolean;
}

/** What an action (and the actions chained after it with /Next) does. */
function classify(doc: PDFDocument, action: PDFObject | undefined, depth = 0, seen = new Set<PDFObject>()): ActionKinds {
  const out: ActionKinds = { script: false, risky: false, web: false };
  const value = action instanceof PDFRef ? doc.context.lookup(action) : action;
  if (!value || depth > 32 || seen.has(value)) return out;
  seen.add(value);
  const merge = (k: ActionKinds) => {
    out.script ||= k.script;
    out.risky ||= k.risky;
    out.web ||= k.web;
  };
  if (value instanceof PDFArray) {
    for (let i = 0; i < value.size(); i++) merge(classify(doc, value.get(i), depth + 1, seen));
    return out;
  }
  if (!(value instanceof PDFDict)) return out;
  const s = nameOf(value.lookup(PDFName.of("S")));
  if (s === SCRIPT || value.has(PDFName.of("JS"))) out.script = true;
  if (s && RISKY.has(s)) out.risky = true;
  if (s === "URI") out.web = true;
  merge(classify(doc, value.get(PDFName.of("Next")), depth + 1, seen));
  return out;
}

/** Leaf values of a name tree, with their names. */
function nameTree(doc: PDFDocument, node: PDFDict | undefined, out: { name: string; value: PDFObject }[] = [], depth = 0): typeof out {
  if (!node || depth > 32) return out;
  const names = node.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (names) for (let i = 0; i + 1 < names.size(); i += 2) out.push({ name: text(names.lookup(i)), value: names.get(i + 1) });
  const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
  if (kids) for (let i = 0; i < kids.size(); i++) nameTree(doc, kids.lookupMaybe(i, PDFDict), out, depth + 1);
  return out;
}

/** Segments of a JPEG that carry data about the photo rather than the picture: EXIF and XMP (APP1), IPTC (APP13), comments. */
const JPEG_METADATA = new Set([0xe1, 0xed, 0xfe]);

/** The JPEG without its EXIF, XMP, IPTC and comment segments; the same array when it has none. Colour profiles stay. */
export function stripJpegMetadata(data: Uint8Array): Uint8Array {
  const at = (i: number) => data[i] ?? 0;
  if (data.length < 4 || at(0) !== 0xff || at(1) !== 0xd8) return data;
  const kept: Uint8Array[] = [data.subarray(0, 2)];
  let i = 2;
  let removed = false;
  while (i + 4 <= data.length && at(i) === 0xff) {
    const marker = at(i + 1);
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) break;
    const end = i + 2 + ((at(i + 2) << 8) | at(i + 3));
    if (end > data.length) return data;
    if (JPEG_METADATA.has(marker)) removed = true;
    else kept.push(data.subarray(i, end));
    i = end;
  }
  if (!removed) return data;
  kept.push(data.subarray(i));
  const out = new Uint8Array(kept.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of kept) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const isPlainJpeg = (stream: PDFStream) => {
  const { names } = filtersOf(stream.dict);
  return names.length === 1 && names[0] === "DCTDecode";
};

/** How many times the file was saved on top of itself (each update adds a startxref; a linearized file has one extra). */
function countEarlierVersions(bytes: Uint8Array): number {
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 2048)));
  const linearized = head.includes("/Linearized");
  let count = 0;
  const needle = [115, 116, 97, 114, 116, 120, 114, 101, 102]; // "startxref"
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) continue outer;
    count++;
  }
  return Math.max(0, count - 1 - (linearized ? 1 : 0));
}

/* ----------------------------------------------------------------------------------------------- */
/* Layers                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

/** The optional content groups that are off when the file opens. */
function hiddenGroups(doc: PDFDocument): { all: number; hidden: Set<string> } {
  const props = doc.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFDict);
  const hidden = new Set<string>();
  if (!props) return { all: 0, hidden };
  const groups = props.lookupMaybe(PDFName.of("OCGs"), PDFArray);
  const refs = groups ? groups.asArray().filter((x): x is PDFRef => x instanceof PDFRef).map((r) => r.toString()) : [];
  const d = props.lookupMaybe(PDFName.of("D"), PDFDict);
  const list = (key: string) => (d?.lookupMaybe(PDFName.of(key), PDFArray)?.asArray() ?? []).filter((x): x is PDFRef => x instanceof PDFRef).map((r) => r.toString());
  if (nameOf(d?.lookup(PDFName.of("BaseState"))) === "OFF") {
    const on = new Set(list("ON"));
    for (const r of refs) if (!on.has(r)) hidden.add(r);
  } else for (const r of list("OFF")) hidden.add(r);
  return { all: refs.length, hidden };
}

/** Whether an /OC entry (a group, or a membership dictionary of groups) is hidden. */
function isHidden(doc: PDFDocument, oc: PDFObject | undefined, hidden: Set<string>): boolean {
  if (!oc || hidden.size === 0) return false;
  if (oc instanceof PDFRef && hidden.has(oc.toString())) return true;
  const dict = oc instanceof PDFRef ? doc.context.lookup(oc) : oc;
  if (!(dict instanceof PDFDict) || nameOf(dict.lookup(PDFName.of("Type"))) !== "OCMD") return false;
  const ocgs = dict.get(PDFName.of("OCGs"));
  const members = ocgs instanceof PDFArray ? ocgs.asArray() : ocgs ? [ocgs] : [];
  const on = members.map((m) => !(m instanceof PDFRef && hidden.has(m.toString())));
  if (on.length === 0) return false;
  switch (nameOf(dict.lookup(PDFName.of("P"))) ?? "AnyOn") {
    case "AllOn":
      return !on.every(Boolean);
    case "AnyOff":
      return on.every(Boolean);
    case "AllOff":
      return on.some(Boolean);
    default:
      return !on.some(Boolean);
  }
}

const PAINT_PATH = new Set(["f", "F", "f*", "B", "B*", "b", "b*", "S", "s"]);

/**
 * Takes the drawing out of hidden marked content (and Do of hidden XObjects) while keeping every state change, so
 * what follows draws exactly as before. Paths end with `n` (keeping any clip); text keeps its position.
 */
function hideContent(doc: PDFDocument, s: string, resources: PDFDict | undefined, hidden: Set<string>): { text: string; removed: number } | null {
  const props = resources?.lookupMaybe(PDFName.of("Properties"), PDFDict);
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  const stack: boolean[] = [];
  const out: string[] = [];
  let emitted = 0;
  let removed = 0;
  let operands: Token[] = [];
  let i = 0;
  const replace = (from: number, to: number, value: string) => {
    out.push(s.slice(emitted, from), value);
    emitted = to;
    removed++;
  };
  for (;;) {
    const t = readToken(s, i);
    if (!t) break;
    i = t.end;
    if (t.kind !== "op" || t.text === "true" || t.text === "false" || t.text === "null") {
      operands.push(t);
      continue;
    }
    const op = t.text;
    const from = operands[0]?.start ?? t.start;
    const inHidden = stack[stack.length - 1] ?? false;
    switch (op) {
      case "BMC":
        stack.push(inHidden);
        break;
      case "BDC": {
        const tag = operands[0];
        const prop = operands[1];
        let off = false;
        if (tag?.kind === "name" && tag.text === "OC" && prop?.kind === "name") off = isHidden(doc, props?.get(PDFName.of(unescapeName(prop.text))), hidden);
        stack.push(inHidden || off);
        break;
      }
      case "EMC":
        stack.pop();
        break;
      case "Do": {
        const name = operands[operands.length - 1];
        const xobject = name?.kind === "name" ? xobjects?.lookup(PDFName.of(unescapeName(name.text))) : undefined;
        const dict = xobject instanceof PDFStream ? xobject.dict : undefined;
        if (inHidden || isHidden(doc, dict?.get(PDFName.of("OC")), hidden)) replace(from, t.end, "");
        break;
      }
      case "BI": {
        // Skip the inline image; drop it when hidden.
        const id = /\sID\s/g;
        id.lastIndex = t.end;
        const found = id.exec(s);
        if (!found) return null;
        const ei = /\sEI(?=\s|$)/g;
        ei.lastIndex = found.index + found[0].length;
        const end = ei.exec(s);
        if (!end) return null;
        i = end.index + end[0].length;
        if (inHidden) replace(t.start, i, "");
        break;
      }
      default:
        if (!inHidden) break;
        if (PAINT_PATH.has(op)) replace(from, t.end, "n");
        else if (op === "sh" || op === "Tj" || op === "TJ") replace(from, t.end, "");
        else if (op === "'") replace(from, t.end, "T*");
        else if (op === '"') {
          const [aw, ac] = operands;
          replace(from, t.end, `${aw?.text ?? 0} Tw ${ac?.text ?? 0} Tc T*`);
        }
    }
    operands = [];
  }
  if (removed === 0) return null;
  out.push(s.slice(emitted));
  return { text: out.join(""), removed };
}

/* ----------------------------------------------------------------------------------------------- */
/* Inspect                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

function inspectDocument(doc: PDFDocument, bytes: Uint8Array): SanitizeFindings {
  const f: SanitizeFindings = { scripts: 0, actions: 0, attachments: 0, attachmentNames: [], info: [], xmp: 0, privateData: 0, photosWithData: 0, fileId: false, layers: 0, hiddenLayers: 0, comments: 0, formFields: 0, webLinks: 0, thumbnails: 0, earlierVersions: countEarlierVersions(bytes) };
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  f.scripts += nameTree(doc, names?.lookupMaybe(PDFName.of("JavaScript"), PDFDict)).length;
  const files = nameTree(doc, names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict));
  f.attachments += files.length;
  f.attachmentNames.push(...files.map((x) => x.name));

  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : null;
    if (!dict) continue;
    if (dict.has(PDFName.of("Metadata"))) f.xmp++;
    if (dict.has(PDFName.of("PieceInfo"))) f.privateData++;
    if (object instanceof PDFRawStream && nameOf(dict.lookup(PDFName.of("Subtype"))) === "Image" && isPlainJpeg(object) && stripJpegMetadata(object.contents) !== object.contents) f.photosWithData++;
    for (const key of ["A", "OpenAction"]) {
      const kinds = classify(doc, dict.get(PDFName.of(key)));
      if (kinds.script) f.scripts++;
      if (kinds.risky) f.actions++;
      if (kinds.web) f.webLinks++;
    }
    const aa = dict.lookupMaybe(PDFName.of("AA"), PDFDict);
    if (aa) for (const [, action] of aa.entries()) {
      const kinds = classify(doc, action);
      if (kinds.script) f.scripts++;
      if (kinds.risky) f.actions++;
    }
  }
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  // An XFA form is a second form made of XML, which can carry scripts of its own.
  if (form?.has(PDFName.of("XFA"))) f.scripts++;

  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of("Thumb"))) f.thumbnails++;
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict);
      const subtype = nameOf(annot?.lookup(PDFName.of("Subtype")));
      if (!annot || subtype === "Popup" || subtype === "Link") continue;
      if (subtype === "Widget") f.formFields++;
      else if (subtype === "FileAttachment") {
        f.attachments++;
        const spec = annot.lookup(PDFName.of("FS"));
        const name = spec instanceof PDFDict ? text(spec.lookup(PDFName.of("UF"))) || text(spec.lookup(PDFName.of("F"))) : "";
        if (name) f.attachmentNames.push(name);
      } else f.comments++;
    }
  }
  f.attachmentNames = f.attachmentNames.slice(0, 20);

  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  if (info instanceof PDFDict) for (const [key, value] of info.entries()) if (text(value).trim() || value instanceof PDFName) f.info.push(key.decodeText());
  f.fileId = !!doc.context.trailerInfo.ID;
  const layers = hiddenGroups(doc);
  f.layers = layers.all;
  f.hiddenLayers = layers.hidden.size;
  return f;
}

/** What a PDF carries besides its pages. */
export async function inspectSanitize(bytes: Uint8Array): Promise<SanitizeFindings> {
  return inspectDocument(await loadPdf(bytes), bytes);
}

/** How many things a set of findings lists, for the categories that are always worth knowing about. */
export function concerns(f: SanitizeFindings): number {
  return f.scripts + f.actions + f.attachments + f.info.length + f.xmp + f.privateData + f.photosWithData + f.hiddenLayers + f.earlierVersions;
}

/* ----------------------------------------------------------------------------------------------- */
/* Sanitize                                                                                         */
/* ----------------------------------------------------------------------------------------------- */

export async function sanitizePdf(bytes: Uint8Array, options: SanitizeOptions = {}): Promise<SanitizeResult> {
  const { scripts = true, actions = true, attachments = true, metadata = true, hiddenLayers = true, comments = false, forms = false, webLinks = false } = options;
  if (![scripts, actions, attachments, metadata, hiddenLayers, comments, forms, webLinks].some(Boolean)) throw new PdfError("Choose at least one thing to remove.");

  const original = inspectDocument(await loadPdf(bytes), bytes);
  // Flattening first keeps the answers on the page; the fields (and their scripts) are then gone.
  const start = forms && original.formFields > 0 ? (await flattenPdf(bytes, { forms: true, comments: false })).data : bytes;
  const doc = await loadPdf(start);
  const catalog = doc.catalog;
  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);

  if (scripts) {
    names?.delete(PDFName.of("JavaScript"));
    catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict)?.delete(PDFName.of("XFA"));
  }
  if (attachments) {
    names?.delete(PDFName.of("EmbeddedFiles"));
    catalog.delete(PDFName.of("Collection"));
  }

  // Actions, metadata and private data, wherever they are.
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : null;
    if (!dict) continue;
    for (const key of ["A", "OpenAction"]) {
      const kinds = classify(doc, dict.get(PDFName.of(key)));
      if ((scripts && kinds.script) || (actions && kinds.risky) || (webLinks && kinds.web)) dict.delete(PDFName.of(key));
    }
    const aa = dict.lookupMaybe(PDFName.of("AA"), PDFDict);
    if (aa) {
      for (const [key, action] of aa.entries()) {
        const kinds = classify(doc, action);
        if ((scripts && kinds.script) || (actions && kinds.risky)) aa.delete(key);
      }
      if (aa.keys().length === 0) dict.delete(PDFName.of("AA"));
    }
    if (attachments) dict.delete(PDFName.of("AF"));
    if (metadata) {
      dict.delete(PDFName.of("Metadata"));
      dict.delete(PDFName.of("PieceInfo"));
      dict.delete(PDFName.of("LastModified"));
      if (object instanceof PDFRawStream && nameOf(dict.lookup(PDFName.of("Subtype"))) === "Image" && isPlainJpeg(object)) {
        const clean = stripJpegMetadata(object.contents);
        if (clean !== object.contents) {
          const next = PDFRawStream.of(dict, clean);
          dict.set(PDFName.of("Length"), PDFNumber.of(clean.length));
          doc.context.assign(ref, next);
        }
      }
    }
  }
  if (scripts) catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict)?.delete(PDFName.of("CO"));
  if (metadata) {
    doc.context.trailerInfo.Info = undefined;
    doc.context.trailerInfo.ID = undefined;
  }

  // Hidden layers.
  let hiddenContent = 0;
  const layers = hiddenGroups(doc);
  if (hiddenLayers && layers.hidden.size > 0) {
    const done = new Set<string>();
    const walk = (s: string, resources: PDFDict | undefined, depth: number): string | null => {
      // Forms drawn here get the same treatment.
      const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      if (xobjects && depth < 20)
        for (const [, raw] of xobjects.entries()) {
          if (!(raw instanceof PDFRef) || done.has(raw.toString())) continue;
          done.add(raw.toString());
          const form = doc.context.lookup(raw);
          if (!(form instanceof PDFStream) || nameOf(form.dict.lookup(PDFName.of("Subtype"))) !== "Form") continue;
          const own = form.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
          const decoded = decodeStream(form);
          if (!decoded) continue;
          const next = walk(latin1(decoded), own, depth + 1);
          if (next === null) continue;
          const stream = doc.context.flateStream(toBytes(next), {});
          for (const [k, v] of form.dict.entries()) if (!["Filter", "DecodeParms", "Length"].includes(k.decodeText())) stream.dict.set(k, v);
          doc.context.assign(raw, stream);
        }
      const result = hideContent(doc, s, resources, layers.hidden);
      if (!result) return null;
      hiddenContent += result.removed;
      return result.text;
    };
    for (const page of doc.getPages()) {
      const resources = page.node.Resources();
      const contents = page.node.get(PDFName.of("Contents"));
      const list = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
      const parts = list.map((p) => {
        const stream = doc.context.lookup(p);
        return stream instanceof PDFStream ? decodeStream(stream) : null;
      });
      if (parts.some((p) => p === null)) continue;
      const next = walk(parts.map((p) => latin1(p as Uint8Array)).join("\n"), resources, 0);
      if (next !== null) page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(toBytes(next))));
    }
    catalog.delete(PDFName.of("OCProperties"));
  }

  // Page by page: thumbnails, page actions, and annotations to remove.
  for (const page of doc.getPages()) {
    page.node.delete(PDFName.of("Thumb"));
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    const kept: PDFObject[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const annot = annots.lookupMaybe(i, PDFDict);
      if (!annot) continue;
      const subtype = nameOf(annot.lookup(PDFName.of("Subtype")));
      if (hiddenLayers && layers.hidden.size > 0 && isHidden(doc, annot.get(PDFName.of("OC")), layers.hidden)) continue;
      if (attachments && subtype === "FileAttachment") continue;
      if (comments && subtype !== "Link" && subtype !== "Widget") continue;
      // A link left with nowhere to go is removed.
      if (subtype === "Link" && !annot.has(PDFName.of("A")) && !annot.has(PDFName.of("Dest"))) continue;
      kept.push(raw);
    }
    if (kept.length) page.node.set(PDFName.of("Annots"), doc.context.obj(kept));
    else page.node.delete(PDFName.of("Annots"));
  }

  await doc.flush();
  const dropped = removeUnusedObjects(doc);
  const data = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });

  const removed: Partial<SanitizeFindings> = { earlierVersions: original.earlierVersions, thumbnails: original.thumbnails };
  if (scripts) removed.scripts = original.scripts;
  if (actions) removed.actions = original.actions;
  if (attachments) {
    removed.attachments = original.attachments;
    removed.attachmentNames = original.attachmentNames;
  }
  if (metadata) Object.assign(removed, { info: original.info, xmp: original.xmp, privateData: original.privateData, photosWithData: original.photosWithData, fileId: original.fileId });
  if (hiddenLayers) removed.hiddenLayers = original.hiddenLayers;
  if (comments) removed.comments = original.comments;
  if (forms) removed.formFields = original.formFields;
  if (webLinks) removed.webLinks = original.webLinks;
  return { data, removed, hiddenContent, dropped };
}
