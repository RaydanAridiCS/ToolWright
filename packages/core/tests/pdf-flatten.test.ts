import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFPage, type PDFRef } from "pdf-lib";
import { flattenPdf, inspectFlatten, removeUnusedObjects } from "../src/pdf-flatten";
import { readItems } from "./pdf-read-back";

/** A stream holding drawing operators, usable as an appearance. */
function appearance(doc: PDFDocument, ops: string, bbox: number[], resources?: PDFDict, matrix?: number[]): PDFRef {
  const stream = doc.context.flateStream(ops, { Type: "XObject", Subtype: "Form", BBox: bbox, ...(matrix ? { Matrix: matrix } : {}), ...(resources ? { Resources: resources } : {}) });
  return doc.context.register(stream);
}

function addAnnot(doc: PDFDocument, page: PDFPage, entries: Record<string, unknown>): PDFRef {
  const ref = doc.context.register(doc.context.obj({ Type: "Annot", ...entries } as never));
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
  return ref;
}

/** A form with a filled text field and a ticked box, a highlight with words in its picture, a note without a picture, a hidden stamp and a link. */
async function sample(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Body text", { x: 50, y: 750, size: 12, font });
  const form = doc.getForm();
  const name = form.createTextField("name");
  name.addToPage(page, { x: 50, y: 600, width: 200, height: 24, font });
  name.setText("Ada Lovelace");
  const agree = form.createCheckBox("agree");
  agree.addToPage(page, { x: 50, y: 560, width: 16, height: 16 });
  agree.check();
  form.createTextField("empty").addToPage(page, { x: 50, y: 520, width: 200, height: 24, font });
  form.updateFieldAppearances(font);

  const fontRef = doc.context.getObjectRef(font.ref as never) ?? font.ref;
  const resources = doc.context.obj({ Font: { F1: fontRef } });
  // A stamp whose picture is drawn in a 100 x 20 box, shown on a 200 x 40 rectangle.
  const stampAp = appearance(doc, "BT /F1 10 Tf 5 5 Td (APPROVED) Tj ET", [0, 0, 100, 20], resources);
  addAnnot(doc, page, { Subtype: "Stamp", Rect: [300, 300, 500, 340], AP: { N: stampAp } });
  const popup = addAnnot(doc, page, { Subtype: "Popup", Rect: [400, 400, 500, 450] });
  addAnnot(doc, page, { Subtype: "Text", Rect: [20, 20, 40, 40], Contents: PDFString.of("A note"), Popup: popup });
  addAnnot(doc, page, { Subtype: "Highlight", Rect: [45, 745, 120, 765], QuadPoints: [45, 765, 120, 765, 45, 745, 120, 745], AP: { N: appearance(doc, "1 1 0 rg 0 0 75 20 re f", [0, 0, 75, 20]) } });
  addAnnot(doc, page, { Subtype: "Stamp", F: 2, Rect: [300, 100, 400, 140], AP: { N: appearance(doc, "BT /F1 10 Tf 5 5 Td (SECRET) Tj ET", [0, 0, 100, 40], resources) } });
  addAnnot(doc, page, { Subtype: "Link", Rect: [50, 700, 150, 720], A: { S: "URI", URI: PDFString.of("https://example.com") } });
  page.drawRectangle({ x: 0, y: 0, width: 1, height: 1, color: rgb(1, 1, 1) });
  return doc.save();
}

const subtypes = (doc: PDFDocument) =>
  doc.getPages().flatMap((p) => {
    const annots = p.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    return annots ? Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict).lookup(PDFName.of("Subtype"), PDFName).decodeText()) : [];
  });

describe("inspectFlatten", () => {
  it("counts fields, filled fields, comments by kind and links", async () => {
    const report = await inspectFlatten(await sample());
    expect(report).toMatchObject({ pages: 1, fields: 3, filledFields: 2, signatures: 0, commentTotal: 4, links: 1, xfa: false });
    expect(report.comments).toEqual({ stamps: 2, notes: 1, highlights: 1 });
  });
});

describe("flattenPdf", () => {
  it("draws fields and comments into the page and removes the form and the comments, keeping links", async () => {
    const result = await flattenPdf(await sample());
    expect(result).toMatchObject({ fields: 3, comments: 2, withoutPicture: 1, links: 0 });
    const out = await PDFDocument.load(result.data);
    expect(out.catalog.has(PDFName.of("AcroForm"))).toBe(false);
    expect(out.getForm().getFields()).toEqual([]);
    expect(subtypes(out)).toEqual(["Link"]);
    const items = await readItems(result.data);
    expect(items.map((i) => i.str)).toEqual(expect.arrayContaining(["Body text", "Ada Lovelace", "APPROVED"]));
    // The hidden stamp was not visible, so it is not drawn.
    expect(items.map((i) => i.str)).not.toContain("SECRET");
    // The stamp's 100 x 20 picture is stretched onto its 200 x 40 rectangle: text at 5,5 lands at 310,310.
    const approved = items.find((i) => i.str === "APPROVED");
    expect(approved?.x).toBeCloseTo(310, 0);
    expect(approved?.y).toBeCloseTo(310, 0);
    // Re-inspecting finds nothing left to fill or edit.
    expect(await inspectFlatten(result.data)).toMatchObject({ fields: 0, commentTotal: 0, links: 1 });
  });

  it("drops the old field values from the file", async () => {
    const result = await flattenPdf(await sample());
    expect(result.dropped).toBeGreaterThan(0);
    // The value is now page content (compressed), not a field value written out as a string.
    expect(Buffer.from(result.data).toString("latin1")).not.toContain("(Ada Lovelace)");
  });

  it("can flatten only the form, or only the comments, and remove links", async () => {
    const formsOnly = await PDFDocument.load((await flattenPdf(await sample(), { comments: false })).data);
    expect(formsOnly.catalog.has(PDFName.of("AcroForm"))).toBe(false);
    expect(subtypes(formsOnly).sort()).toEqual(["Highlight", "Link", "Popup", "Stamp", "Stamp", "Text"]);

    const commentsOnly = await flattenPdf(await sample(), { forms: false, removeLinks: true });
    const out = await PDFDocument.load(commentsOnly.data);
    expect(out.getForm().getFields().map((f) => f.getName()).sort()).toEqual(["agree", "empty", "name"]);
    expect(subtypes(out)).toEqual(["Widget", "Widget", "Widget"]);
    expect(commentsOnly).toMatchObject({ fields: 0, comments: 2, links: 1 });
  });

  it("follows the appearance's own matrix", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const resources = doc.context.obj({ Font: { F1: font.ref } });
    // A picture turned a quarter: the 100 x 20 box becomes 20 x 100, shown on a 20 x 100 rectangle.
    const ap = appearance(doc, "BT /F1 8 Tf 2 2 Td (UP) Tj ET", [0, 0, 100, 20], resources, [0, 1, -1, 0, 20, 0]);
    addAnnot(doc, page, { Subtype: "FreeText", Rect: [100, 100, 120, 200], AP: { N: ap } });
    const result = await flattenPdf(await doc.save());
    const up = (await readItems(result.data)).find((i) => i.str === "UP");
    // x' = -y + 20 = 18, y' = x = 2, then moved to the rectangle at 100,100.
    expect(up?.x).toBeCloseTo(118, 0);
    expect(up?.y).toBeCloseTo(102, 0);
  });

  it("asks what to flatten when nothing is chosen", async () => {
    await expect(flattenPdf(await sample(), { forms: false, comments: false })).rejects.toThrow(/Choose what to flatten/);
  });

  it("counts a signed signature field", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const sigValue = doc.context.register(doc.context.obj({ Type: "Sig", Filter: "Adobe.PPKLite", Contents: PDFString.of("0000") }));
    const widget = addAnnot(doc, page, { Subtype: "Widget", FT: "Sig", T: PDFString.of("Signature1"), V: sigValue, Rect: [10, 10, 110, 40] });
    doc.catalog.set(PDFName.of("AcroForm"), doc.context.obj({ Fields: [widget], SigFlags: 3 }));
    expect(await inspectFlatten(await doc.save())).toMatchObject({ fields: 1, signatures: 1, signed: 1 });
  });
});

describe("removeUnusedObjects", () => {
  it("keeps everything reachable and drops the rest", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.setTitle("Kept");
    const orphan = doc.context.register(doc.context.obj({ Secret: PDFString.of("gone") }));
    expect(removeUnusedObjects(doc)).toBe(1);
    expect(doc.context.lookup(orphan)).toBeUndefined();
    const out = await PDFDocument.load(await doc.save());
    expect(out.getTitle()).toBe("Kept");
    expect(out.getPageCount()).toBe(1);
  });
});
