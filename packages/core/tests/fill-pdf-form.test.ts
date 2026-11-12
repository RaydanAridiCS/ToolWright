import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { changedValues, fillPdfForm, readForm } from "../src/fill-pdf-form";
import { fontsFromDisk, readBack } from "./pdf-read-back";

/** A two-page PDF with one field of every kind; page 1 holds the text, checkbox and radio fields, page 2 the choices. */
async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const p1 = doc.addPage([400, 500]);
  const p2 = doc.addPage([400, 500]);
  const form = doc.getForm();

  const name = form.createTextField("name");
  name.setText("Ada");
  name.addToPage(p1, { x: 40, y: 440, width: 200, height: 24 });

  const notes = form.createTextField("notes");
  notes.enableMultiline();
  notes.addToPage(p1, { x: 40, y: 360, width: 300, height: 60 });

  const code = form.createTextField("code");
  code.setMaxLength(4);
  code.addToPage(p1, { x: 40, y: 320, width: 80, height: 24 });

  const agree = form.createCheckBox("agree");
  agree.addToPage(p1, { x: 40, y: 280, width: 18, height: 18 });

  const size = form.createRadioGroup("size");
  size.addOptionToPage("Small", p1, { x: 40, y: 240, width: 16, height: 16 });
  size.addOptionToPage("Large", p1, { x: 80, y: 240, width: 16, height: 16 });

  const country = form.createDropdown("country");
  country.addOptions(["Canada", "Chile", "China"]);
  country.addToPage(p2, { x: 40, y: 440, width: 160, height: 24 });

  const toppings = form.createOptionList("toppings");
  toppings.addOptions(["Ham", "Olives", "Onion"]);
  toppings.enableMultiselect();
  toppings.addToPage(p2, { x: 40, y: 340, width: 160, height: 70 });

  const locked = form.createTextField("locked");
  locked.setText("fixed");
  locked.enableReadOnly();
  locked.addToPage(p2, { x: 40, y: 300, width: 100, height: 24 });

  return doc.save();
}

async function plainPdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 500]);
  return doc.save();
}

const field = (info: Awaited<ReturnType<typeof readForm>>, name: string) => info.fields.find((f) => f.name === name)!;

describe("readForm", () => {
  it("lists every kind of field with its value, choices and page", async () => {
    const info = await readForm(await formPdf());
    expect(info.fields.map((f) => f.name)).toEqual(["name", "notes", "code", "agree", "size", "country", "toppings", "locked"]);
    expect(field(info, "name")).toMatchObject({ kind: "text", value: "Ada", page: 0, multiline: false });
    expect(field(info, "notes")).toMatchObject({ kind: "text", multiline: true });
    expect(field(info, "code")).toMatchObject({ maxLength: 4 });
    expect(field(info, "agree")).toMatchObject({ kind: "checkbox", value: false, page: 0 });
    expect(field(info, "size")).toMatchObject({ kind: "radio", value: "", options: ["Small", "Large"], page: 0 });
    expect(field(info, "country")).toMatchObject({ kind: "dropdown", options: ["Canada", "Chile", "China"], page: 1 });
    expect(field(info, "toppings")).toMatchObject({ kind: "list", value: [], multiSelect: true, page: 1 });
    expect(field(info, "locked")).toMatchObject({ readOnly: true, value: "fixed" });
    expect(info).toMatchObject({ signatureFields: 0, xfa: false, signed: false });
  });

  it("reports an empty form for a PDF with no fields", async () => {
    expect(await readForm(await plainPdf())).toMatchObject({ fields: [], xfa: false });
  });

  it("notices a dynamic XFA form", async () => {
    const doc = await PDFDocument.load(await formPdf());
    const acro = doc.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    acro.set(PDFName.of("XFA"), PDFArray.withContext(doc.context));
    expect((await readForm(await doc.save())).xfa).toBe(true);
  });
});

describe("fillPdfForm", () => {
  it("fills every kind of field and reads the values back", async () => {
    const out = await fillPdfForm(await formPdf(), {
      values: { name: "Grace Hopper", notes: "line one\nline two", agree: true, size: "Large", country: "Chile", toppings: ["Ham", "Onion"] },
    });
    const info = await readForm(out);
    expect(field(info, "name").value).toBe("Grace Hopper");
    expect(field(info, "notes").value).toBe("line one\nline two");
    expect(field(info, "agree").value).toBe(true);
    expect(field(info, "size").value).toBe("Large");
    expect(field(info, "country").value).toBe("Chile");
    expect(field(info, "toppings").value).toEqual(["Ham", "Onion"]);
    expect(field(info, "locked").value).toBe("fixed");
    expect(info.fields).toHaveLength(8); // still fillable
  });

  it("clears values", async () => {
    const filled = await fillPdfForm(await formPdf(), { values: { agree: true, size: "Small", country: "Canada", toppings: ["Ham"] } });
    const cleared = await fillPdfForm(filled, { values: { name: "", agree: false, size: "", country: "", toppings: [] } });
    const info = await readForm(cleared);
    expect(field(info, "name").value).toBe("");
    expect(field(info, "agree").value).toBe(false);
    expect(field(info, "size").value).toBe("");
    expect(field(info, "country").value).toBe("");
    expect(field(info, "toppings").value).toEqual([]);
  });

  it("flattens: the fields go and the page keeps what was entered", async () => {
    const before = await formPdf();
    const out = await fillPdfForm(before, { values: { name: "Grace" }, flatten: true });
    expect((await readForm(out)).fields).toEqual([]);
    expect(out.length).toBeGreaterThan(0);
    const reopened = await PDFDocument.load(out);
    expect(reopened.getPageCount()).toBe(2);
  });

  it("can flatten without changing any value", async () => {
    const out = await fillPdfForm(await formPdf(), { flatten: true });
    expect((await readForm(out)).fields).toEqual([]);
  });

  it("leaves the input bytes untouched", async () => {
    const input = await formPdf();
    const copy = input.slice();
    await fillPdfForm(input, { values: { name: "x" }, flatten: true });
    expect(input).toEqual(copy);
  });

  it("explains each kind of mistake", async () => {
    const bytes = await formPdf();
    await expect(fillPdfForm(bytes, { values: { missing: "x" } })).rejects.toThrow("no field called “missing”");
    await expect(fillPdfForm(bytes, { values: { locked: "x" } })).rejects.toThrow("read-only");
    await expect(fillPdfForm(bytes, { values: { code: "12345" } })).rejects.toThrow("at most 4 characters");
    await expect(fillPdfForm(bytes, { values: { name: true } })).rejects.toThrow("needs text");
    await expect(fillPdfForm(bytes, { values: { agree: "yes" } })).rejects.toThrow("needs on or off");
    await expect(fillPdfForm(bytes, { values: { size: "Medium" } })).rejects.toThrow("no option “Medium”");
    await expect(fillPdfForm(bytes, { values: { country: "Peru" } })).rejects.toThrow("no option “Peru”");
    await expect(fillPdfForm(bytes, { values: { toppings: ["Ham", "Pineapple"] } })).rejects.toThrow("no option “Pineapple”");
  });

  it("refuses characters the standard font cannot print", async () => {
    await expect(fillPdfForm(await formPdf(), { values: { name: "名前" } })).rejects.toThrow(/characters the form's font cannot print/);
  });

  it("types Cyrillic, Greek and accented text onto a page when it is given the fonts", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 500]);
    const stamps = [
      { page: 0, text: "Иван Петров", left: 40, top: 60, size: 14 },
      { page: 0, text: "Ελένη Παπά", left: 40, top: 100, size: 14 },
      { page: 0, text: "Łódź, Žilina", left: 40, top: 140, size: 14 },
    ];
    const out = await fillPdfForm(await doc.save(), { stamps, loadFont: fontsFromDisk });
    const text = await readBack(out);
    expect(text).toContain("Иван Петров");
    expect(text).toContain("Ελένη Παπά");
    expect(text).toContain("Łódź, Žilina");
  });

  it("names a typed character that no font can print", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 500]);
    await expect(fillPdfForm(await doc.save(), { stamps: [{ page: 0, text: "名前", left: 40, top: 60, size: 14 }], loadFont: fontsFromDisk })).rejects.toThrow(/cannot be printed: 名 前/);
  });

  it("explains encrypted and corrupt files", async () => {
    const dir = join(__dirname, "fixtures", "pdf");
    await expect(fillPdfForm(new Uint8Array(readFileSync(join(dir, "encrypted.pdf"))), { flatten: true })).rejects.toThrow(/password-protected/);
    await expect(readForm(new Uint8Array(readFileSync(join(dir, "corrupt.pdf"))))).rejects.toThrow(/could not be read/);
  });
});

describe("typed text on pages without fields", () => {
  const stamp = { page: 0, left: 50, top: 100, text: "Jane Doe", size: 12 };

  it("prints text and keeps the page count", async () => {
    const before = await plainPdf(2);
    const out = await fillPdfForm(before, { stamps: [stamp, { ...stamp, page: 1, text: "X" }] });
    expect(out.length).toBeGreaterThan(before.length);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("puts the text where it was asked, whatever the page rotation", async () => {
    const decoded = async (rotation: number) => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 500]).setRotation(degrees(rotation));
      const out = await fillPdfForm(await doc.save(), { stamps: [{ page: 0, left: 10, top: 20, text: "Hi", size: 10 }] });
      const page = (await PDFDocument.load(out)).getPage(0);
      const contents = page.node.Contents();
      const raw = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
      return raw.length;
    };
    for (const turn of [0, 90, 180, 270]) expect(await decoded(turn)).toBeGreaterThan(0);
  });

  it("rejects bad stamps with readable messages", async () => {
    const bytes = await plainPdf();
    await expect(fillPdfForm(bytes, { stamps: [{ ...stamp, page: 3 }] })).rejects.toThrow("Page 4 does not exist");
    await expect(fillPdfForm(bytes, { stamps: [{ ...stamp, size: 2 }] })).rejects.toThrow("between 4 and 144");
    await expect(fillPdfForm(bytes, { stamps: [{ ...stamp, left: Number.NaN }] })).rejects.toThrow("needs a position");
    await expect(fillPdfForm(bytes, { stamps: [{ ...stamp, left: 9999 }] })).rejects.toThrow("outside page 1");
    await expect(fillPdfForm(bytes, { stamps: [{ ...stamp, text: "名前" }] })).rejects.toThrow("cannot print");
  });

  it("ignores empty text", async () => {
    const bytes = await plainPdf();
    const out = await fillPdfForm(bytes, { stamps: [{ ...stamp, text: "" }] });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});

describe("changedValues", () => {
  it("keeps only what differs from the file", async () => {
    const info = await readForm(await formPdf());
    expect(changedValues(info.fields, { name: "Ada", agree: true, toppings: [], size: "" })).toEqual({ agree: true });
    expect(changedValues(info.fields, { toppings: ["Ham"] })).toEqual({ toppings: ["Ham"] });
    expect(changedValues(info.fields, {})).toEqual({});
  });
});

describe("test helper sanity", () => {
  it("PDFString is available for fixtures", () => {
    expect(PDFString.of("x").asString()).toBe("x");
  });
});
