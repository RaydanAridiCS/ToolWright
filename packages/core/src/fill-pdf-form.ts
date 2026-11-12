/**
 * Logic for the "Fill PDF Form" tool: read the fields of a fillable PDF, fill them, flatten them, and type text onto
 * pages that have no fields. Works on bytes, so it stays free of React, the DOM and the network.
 */

import {
  PDFCheckBox,
  PDFDict,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  rgb,
  StandardFonts,
  degrees,
  type PDFDocument,
  type PDFField,
} from "pdf-lib";
import { displayToPageSpace, loadPdf, PdfError } from "./pdf";
import { looksDigitallySigned } from "./pdf-sign";

export type FieldKind = "text" | "checkbox" | "radio" | "dropdown" | "list";
export type FieldValue = string | boolean | string[];

export interface FormFieldInfo {
  /** The field's full name; unique in the form. */
  name: string;
  kind: FieldKind;
  /** Current value: text, on/off, the chosen option, or the chosen options of a list. */
  value: FieldValue;
  /** Choices for radio buttons, dropdowns and lists. */
  options: string[];
  readOnly: boolean;
  required: boolean;
  multiline: boolean;
  maxLength?: number;
  /** A dropdown that also accepts typed text, or a list that allows more than one choice. */
  editable: boolean;
  multiSelect: boolean;
  /** Zero-based page the field sits on, when it can be told. */
  page: number | null;
}

export interface FormInfo {
  fields: FormFieldInfo[];
  /** Signature fields are not filled here; Sign PDF adds a visible signature. */
  signatureFields: number;
  /** A dynamic XFA form: other programs show its fields, but they cannot be filled here. */
  xfa: boolean;
  /** The file carries a digital signature, which any change breaks. */
  signed: boolean;
}

function pageOfFields(doc: PDFDocument): Map<PDFDict, number> {
  const map = new Map<PDFDict, number>();
  doc.getPages().forEach((page, index) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookupMaybe(i, PDFDict);
      if (dict) map.set(dict, index);
    }
  });
  return map;
}

function describe(field: PDFField, pages: Map<PDFDict, number>): FormFieldInfo | null {
  const base = { name: field.getName(), readOnly: field.isReadOnly(), required: field.isRequired(), options: [] as string[], multiline: false, editable: false, multiSelect: false };
  const widgets = field.acroField.getWidgets();
  let page: number | null = null;
  for (const widget of widgets) {
    const found = pages.get(widget.dict);
    if (found !== undefined) {
      page = found;
      break;
    }
  }
  if (field instanceof PDFTextField) {
    return { ...base, kind: "text", value: field.getText() ?? "", multiline: field.isMultiline(), maxLength: field.getMaxLength(), page };
  }
  if (field instanceof PDFCheckBox) return { ...base, kind: "checkbox", value: field.isChecked(), page };
  if (field instanceof PDFRadioGroup) return { ...base, kind: "radio", value: field.getSelected() ?? "", options: field.getOptions(), page };
  if (field instanceof PDFDropdown) {
    return { ...base, kind: "dropdown", value: field.getSelected()[0] ?? "", options: field.getOptions(), editable: field.isEditable(), page };
  }
  if (field instanceof PDFOptionList) {
    return { ...base, kind: "list", value: field.getSelected(), options: field.getOptions(), multiSelect: field.isMultiselect(), page };
  }
  return null; // push buttons and signature fields
}

/** List the fillable fields of a PDF, in the order the file stores them. */
export async function readForm(bytes: Uint8Array): Promise<FormInfo> {
  const doc = await loadPdf(bytes);
  // pdf-lib drops the XFA entry as soon as the form is opened, so look for it first.
  const xfa = Boolean(doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict)?.has(PDFName.of("XFA")));
  const form = doc.getForm();
  const pages = pageOfFields(doc);
  const fields: FormFieldInfo[] = [];
  let signatureFields = 0;
  for (const field of form.getFields()) {
    const info = describe(field, pages);
    if (info) fields.push(info);
    else if (field instanceof PDFSignature) signatureFields++;
  }
  return { fields, signatureFields, xfa, signed: looksDigitallySigned(bytes) };
}

/** Text typed straight onto a page, for forms that have no fields. */
export interface TextStamp {
  /** Zero-based page. */
  page: number;
  /** Where the text starts (its left end, on the line it sits on), in points from the left of the page as shown. */
  left: number;
  /** In points from the top of the page as shown. */
  top: number;
  text: string;
  size: number;
  color?: { r: number; g: number; b: number };
}

export interface FillOptions {
  /** New values by field name. Fields that are not listed are left exactly as they are. */
  values?: Record<string, FieldValue>;
  stamps?: TextStamp[];
  /** Turn the fields into ordinary page content, so the entries cannot be edited any more. */
  flatten?: boolean;
}

export const STAMP_LIMITS = { minSize: 4, maxSize: 144 } as const;

const ENCODING = /WinAnsi|encode|cannot|unsupported/i;

function setField(field: PDFField, value: FieldValue): void {
  const name = field.getName();
  if (field.isReadOnly()) throw new PdfError(`“${name}” is read-only and cannot be changed.`);
  const wrong = (expected: string) => new PdfError(`“${name}” needs ${expected}.`);
  try {
    if (field instanceof PDFTextField) {
      if (typeof value !== "string") throw wrong("text");
      const max = field.getMaxLength();
      if (max !== undefined && value.length > max) throw new PdfError(`“${name}” allows at most ${max} characters; this has ${value.length}.`);
      if (value === "") field.setText(undefined);
      else field.setText(value);
    } else if (field instanceof PDFCheckBox) {
      if (typeof value !== "boolean") throw wrong("on or off");
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value !== "string") throw wrong("one of its options");
      if (value === "") field.clear();
      else if (!field.getOptions().includes(value)) throw new PdfError(`“${name}” has no option “${value}”.`);
      else field.select(value);
    } else if (field instanceof PDFDropdown) {
      if (typeof value !== "string") throw wrong("one of its options");
      if (value === "") field.clear();
      else if (!field.isEditable() && !field.getOptions().includes(value)) throw new PdfError(`“${name}” has no option “${value}”.`);
      else field.select(value);
    } else if (field instanceof PDFOptionList) {
      const chosen = Array.isArray(value) ? value : value === "" ? [] : [String(value)];
      if (chosen.length > 1 && !field.isMultiselect()) throw new PdfError(`“${name}” allows only one choice.`);
      const missing = chosen.find((o) => !field.getOptions().includes(o));
      if (missing !== undefined) throw new PdfError(`“${name}” has no option “${missing}”.`);
      if (chosen.length === 0) field.clear();
      else field.select(chosen);
    } else {
      throw new PdfError(`“${name}” is a kind of field that cannot be filled here.`);
    }
  } catch (err) {
    if (err instanceof PdfError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (ENCODING.test(message)) throw new PdfError(`“${name}” has characters the form's font cannot print. Use plain letters, digits and punctuation.`);
    throw new PdfError(`“${name}” could not be filled.`);
  }
}

/** Fill the chosen fields, optionally flatten, and print any typed text. Throws readable errors; the input is never changed. */
export async function fillPdfForm(bytes: Uint8Array, options: FillOptions): Promise<Uint8Array> {
  const { values = {}, stamps = [], flatten = false } = options;
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  // pdf-lib draws filled fields with Helvetica when the file is saved, and only then reports a character it cannot print.
  // Checking each value now lets the message name the field.
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    if (!field) throw new PdfError(`The form has no field called “${name}”.`);
    if (typeof value === "string" && field instanceof PDFTextField) {
      try {
        // Line breaks in a multi-line field are split off by pdf-lib before drawing, so check line by line.
        for (const line of value.split("\n").flatMap((l) => l.split("\r"))) font.encodeText(line);
      } catch {
        throw new PdfError(`“${name}” has characters the form's font cannot print. Use plain letters, digits and punctuation.`);
      }
    }
    setField(field, value);
  }

  if (flatten) {
    try {
      form.flatten();
    } catch {
      throw new PdfError("The form could not be flattened. Some of its fields have no appearance to keep.");
    }
  }

  if (stamps.length > 0) await drawStamps(doc, stamps);
  try {
    return await doc.save({ useObjectStreams: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (ENCODING.test(message)) throw new PdfError("Some text has characters the form's font cannot print. Use plain letters, digits and punctuation.");
    throw new PdfError("The filled form could not be saved.");
  }
}

async function drawStamps(doc: PDFDocument, stamps: TextStamp[]): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  for (const stamp of stamps) {
    if (stamp.text === "") continue;
    const page = pages[stamp.page];
    if (!page) throw new PdfError(`Page ${stamp.page + 1} does not exist (this PDF has ${pages.length} pages).`);
    if (!Number.isFinite(stamp.left) || !Number.isFinite(stamp.top)) throw new PdfError("Each piece of text needs a position on the page.");
    if (!(stamp.size >= STAMP_LIMITS.minSize && stamp.size <= STAMP_LIMITS.maxSize)) throw new PdfError(`Text size must be between ${STAMP_LIMITS.minSize} and ${STAMP_LIMITS.maxSize} points.`);
    try {
      font.widthOfTextAtSize(stamp.text, stamp.size);
    } catch {
      throw new PdfError(`“${stamp.text.slice(0, 30)}” has characters the standard PDF font cannot print. Use plain letters, digits and punctuation.`);
    }
    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    const view = displayToPageSpace(box, rotation, 0, 0).view;
    if (stamp.left < 0 || stamp.left > view.width || stamp.top < 0 || stamp.top > view.height) {
      throw new PdfError(`The text “${stamp.text.slice(0, 30)}” is outside page ${stamp.page + 1}. Move it onto the page.`);
    }
    // `top` counts down from the top of the page as shown; the page's own space counts up from the bottom.
    const at = displayToPageSpace(box, rotation, stamp.left, view.height - stamp.top);
    const c = stamp.color ?? { r: 0, g: 0, b: 0 };
    page.drawText(stamp.text, { x: at.x, y: at.y, size: stamp.size, font, color: rgb(c.r, c.g, c.b), rotate: degrees(at.rotate) });
  }
}

/** Fields whose value differs from what the file holds now; the tool sends only these. */
export function changedValues(fields: readonly FormFieldInfo[], edited: Readonly<Record<string, FieldValue>>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  const same = (a: FieldValue, b: FieldValue) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);
  for (const field of fields) {
    if (field.name in edited && !same(edited[field.name] as FieldValue, field.value)) out[field.name] = edited[field.name] as FieldValue;
  }
  return out;
}
