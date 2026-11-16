import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { inspectSanitize, sanitizePdf, stripJpegMetadata } from "../src/pdf-sanitize";
import { readBack } from "./pdf-read-back";

/** A small JPEG-shaped stream: SOI, EXIF (APP1), JFIF (APP0), a comment, IPTC (APP13), then the scan and EOI. */
const EXIF = [0xff, 0xe1, 0x00, 0x11, ...Array.from("Exif\0\0GPS 51.5N").map((c) => c.charCodeAt(0))];
const JFIF = [0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00];
const COMMENT = [0xff, 0xfe, 0x00, 0x08, ...Array.from("Jane!!").map((c) => c.charCodeAt(0))];
const IPTC = [0xff, 0xed, 0x00, 0x04, 0x01, 0x02];
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9];
const jpeg = new Uint8Array([0xff, 0xd8, ...EXIF, ...JFIF, ...COMMENT, ...IPTC, ...SCAN]);

/** A PDF carrying scripts, actions, attachments, metadata, a hidden layer, a comment and links. */
async function dirty(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  doc.setTitle("Merger plan");
  doc.setAuthor("Jane Doe");
  doc.setProducer("Secret Editor 9");
  const page = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Visible words", { x: 20, y: 350, size: 14, font });

  // A hidden layer with words on it, drawn inside optional content.
  const ocg = ctx.register(ctx.obj({ Type: "OCG", Name: PDFHexString.fromText("Draft notes") }));
  const shown = ctx.register(ctx.obj({ Type: "OCG", Name: PDFHexString.fromText("Shown") }));
  doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: [ocg, shown], D: { OFF: [ocg], Order: [ocg, shown] } }));
  const resources = page.node.Resources() as PDFDict;
  resources.set(PDFName.of("Properties"), ctx.obj({ oc1: ocg, oc2: shown }));
  const fontName = [...(resources.lookup(PDFName.of("Font"), PDFDict).keys())][0]?.decodeText();
  page.pushOperators();
  const extra = ctx.flateStream(`/OC /oc1 BDC BT /${fontName} 12 Tf 20 300 Td (SECRET PLAN) Tj ET 0 0 1 rg 10 10 50 50 re f EMC /OC /oc2 BDC BT /${fontName} 12 Tf 20 250 Td (Layer words) Tj ET EMC`);
  const contents = page.node.lookup(PDFName.of("Contents"));
  const list = contents instanceof PDFArray ? contents : ctx.obj([page.node.get(PDFName.of("Contents"))]);
  (list as PDFArray).push(ctx.register(extra));
  page.node.set(PDFName.of("Contents"), list);

  // Scripts: document-level, on open, on the page, and a launch action and links.
  const js = ctx.obj({ S: "JavaScript", JS: PDFString.of("app.alert('hello')") });
  doc.catalog.set(PDFName.of("Names"), ctx.obj({ JavaScript: { Names: [PDFString.of("init"), ctx.register(js)] } }));
  doc.catalog.set(PDFName.of("OpenAction"), ctx.obj({ S: "JavaScript", JS: PDFString.of("this.submitForm('https://example.com')") }));
  page.node.set(PDFName.of("AA"), ctx.obj({ O: { S: "JavaScript", JS: PDFString.of("console.println(1)") } }));
  const launch = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 20], A: { S: "Launch", F: PDFString.of("cmd.exe") } }));
  const web = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [60, 0, 110, 20], A: { S: "URI", URI: PDFString.of("https://example.com") } }));
  const inside = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [120, 0, 170, 20], Dest: [page.ref, PDFName.of("Fit")] }));
  const note = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [200, 200, 250, 250], Contents: PDFString.of("Looks good") }));

  // Attachments: in the name tree and on the page.
  const file = ctx.register(ctx.flateStream("salary,100000", { Type: "EmbeddedFile" }));
  const spec = ctx.obj({ Type: "Filespec", F: PDFString.of("secret.xlsx"), UF: PDFHexString.fromText("secret.xlsx"), EF: { F: file } });
  (doc.catalog.lookup(PDFName.of("Names"), PDFDict)).set(PDFName.of("EmbeddedFiles"), ctx.obj({ Names: [PDFString.of("secret.xlsx"), ctx.register(spec)] }));
  const pin = ctx.register(ctx.obj({ Type: "Annot", Subtype: "FileAttachment", Rect: [300, 300, 320, 320], FS: { Type: "Filespec", F: PDFString.of("notes.txt"), EF: { F: ctx.register(ctx.flateStream("private notes")) } } }));
  page.node.set(PDFName.of("Annots"), ctx.obj([launch, web, inside, note, pin]));

  // Metadata: XMP, private application data, a photo with camera data.
  doc.catalog.set(PDFName.of("Metadata"), ctx.register(ctx.stream("<x:xmpmeta><dc:creator>Jane Doe</dc:creator></x:xmpmeta>", { Type: "Metadata", Subtype: "XML" })));
  page.node.set(PDFName.of("PieceInfo"), ctx.obj({ Illustrator: { Private: PDFString.of("original artwork") } }));
  const photo = ctx.register(ctx.stream(jpeg, { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, BitsPerComponent: 8, ColorSpace: "DeviceRGB", Filter: "DCTDecode" }));
  resources.set(PDFName.of("XObject"), ctx.obj({ Im0: photo }));
  page.node.set(PDFName.of("Thumb"), ctx.register(ctx.stream(new Uint8Array([1, 2, 3]))));
  const saved = await doc.save({ useObjectStreams: false });
  // An earlier version: the file saved again on top of itself (an incremental update with an empty body).
  const tail = new TextEncoder().encode(`\n${new TextDecoder("latin1").decode(saved.subarray(saved.lastIndexOf(0x74) - 300)).match(/trailer[\s\S]*$/)?.[0] ?? ""}`);
  return new Uint8Array([...saved, ...tail]);
}

/** Every object in a file, streams decoded, as one string to search. */
async function everything(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const parts: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    parts.push(object.toString());
    if (object instanceof PDFRawStream) {
      try {
        parts.push(Buffer.from(decodePDFRawStream(object).decode()).toString("latin1"));
      } catch {
        parts.push(Buffer.from(object.contents).toString("latin1"));
      }
    }
  }
  return parts.join("\n");
}

describe("stripJpegMetadata", () => {
  it("removes EXIF, IPTC and comments and keeps the rest", () => {
    expect(Array.from(stripJpegMetadata(jpeg))).toEqual([0xff, 0xd8, ...JFIF, ...SCAN]);
    const clean = new Uint8Array([0xff, 0xd8, ...JFIF, ...SCAN]);
    expect(stripJpegMetadata(clean)).toBe(clean);
  });
});

describe("inspectSanitize", () => {
  it("finds scripts, actions, attachments, metadata, layers, comments, links and earlier versions", async () => {
    const f = await inspectSanitize(await dirty());
    expect(f).toMatchObject({ scripts: 3, actions: 1, attachments: 2, xmp: 1, privateData: 1, photosWithData: 1, fileId: false, layers: 2, hiddenLayers: 1, comments: 1, webLinks: 1, thumbnails: 1, earlierVersions: 1 });
    expect(f.attachmentNames).toEqual(["secret.xlsx", "notes.txt"]);
    expect(f.info).toEqual(expect.arrayContaining(["Title", "Author", "Producer"]));
  });
});

describe("sanitizePdf", () => {
  it("removes scripts, risky actions, attachments, metadata and hidden content, and keeps the visible page", async () => {
    const result = await sanitizePdf(await dirty());
    const after = await inspectSanitize(result.data);
    expect(after).toMatchObject({ scripts: 0, actions: 0, attachments: 0, info: [], xmp: 0, privateData: 0, photosWithData: 0, fileId: false, hiddenLayers: 0, thumbnails: 0, earlierVersions: 0 });
    // Comments and web links stay unless asked; the link inside the document always stays.
    expect(after).toMatchObject({ comments: 1, webLinks: 1 });
    const page = (await PDFDocument.load(result.data)).getPage(0);
    expect(page.node.lookup(PDFName.of("Annots"), PDFArray).size()).toBe(3);

    const words = await readBack(result.data);
    expect(words).toContain("Visible words");
    expect(words).toContain("Layer words");
    expect(words).not.toContain("SECRET");

    const all = await everything(result.data);
    for (const gone of ["app.alert", "submitForm", "console.println", "cmd.exe", "secret.xlsx", "salary", "private notes", "Jane Doe", "Secret Editor", "original artwork", "GPS 51.5N", "Exif", "SECRET PLAN"]) expect(all).not.toContain(gone);
    expect(result.removed).toMatchObject({ scripts: 3, actions: 1, attachments: 2, hiddenLayers: 1, earlierVersions: 1 });
    expect(result.hiddenContent).toBe(2);
  });

  it("keeps state round hidden content: a hidden fill becomes an end-path, text keeps its place", async () => {
    const result = await sanitizePdf(await dirty());
    const doc = await PDFDocument.load(result.data);
    const contents = doc.getPage(0).node.lookup(PDFName.of("Contents"));
    const stream = (contents instanceof PDFArray ? contents.lookup(0) : contents) as PDFStream;
    const text = Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
    expect(text).toContain("/OC /oc1 BDC BT /");
    expect(text).toContain("20 300 Td  ET 0 0 1 rg 10 10 50 50 re n EMC");
  });

  it("can also remove comments, web links and form fields (keeping the answers on the page)", async () => {
    const doc = await PDFDocument.load(await dirty());
    const field = doc.getForm().createTextField("name");
    field.addToPage(doc.getPage(0), { x: 20, y: 100, width: 150, height: 20 });
    field.setText("Answer kept");
    const result = await sanitizePdf(await doc.save(), { comments: true, webLinks: true, forms: true });
    const after = await inspectSanitize(result.data);
    expect(after).toMatchObject({ comments: 0, webLinks: 0, formFields: 0 });
    expect(await readBack(result.data)).toContain("Answer kept");
    // Only the link inside the document is left.
    const annots = (await PDFDocument.load(result.data)).getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
    expect(annots.size()).toBe(1);
    expect(annots.lookup(0, PDFDict).has(PDFName.of("Dest"))).toBe(true);
  });

  it("only touches what was chosen", async () => {
    const result = await sanitizePdf(await dirty(), { scripts: true, actions: false, attachments: false, metadata: false, hiddenLayers: false });
    const after = await inspectSanitize(result.data);
    expect(after).toMatchObject({ scripts: 0, actions: 1, attachments: 2, hiddenLayers: 1, xmp: 1 });
    expect(after.info).toContain("Author");
    expect(await readBack(result.data)).toContain("SECRET");
  });

  it("asks for a choice", async () => {
    await expect(sanitizePdf(await dirty(), { scripts: false, actions: false, attachments: false, metadata: false, hiddenLayers: false })).rejects.toThrow(/at least one/);
  });
});
