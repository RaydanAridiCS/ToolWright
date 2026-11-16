import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFStream, StandardFonts, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { compileFunction, grayscalePdf, toGray, unpredict, type GrayImageCodec } from "../src/pdf-grayscale";
import { readBack } from "./pdf-read-back";

/** A page whose content is exactly `ops`, with `resources`. */
async function pageWith(ops: string, build?: (doc: PDFDocument, page: PDFPage) => Record<string, unknown> | void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const resources = build?.(doc, page) ?? {};
  const content = doc.context.flateStream(ops);
  page.node.set(PDFName.of("Contents"), doc.context.register(content));
  page.node.set(PDFName.of("Resources"), doc.context.obj(resources as never));
  return doc.save();
}

const decode = (s: PDFStream) => Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents()).toString("latin1");

async function content(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.lookup(PDFName.of("Contents"));
  const list = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r) as PDFStream) : [contents as PDFStream];
  return list.map(decode).join("\n");
}

const close = (a: number | null, b: number) => expect(a).toBeCloseTo(b, 3);

describe("colour maths", () => {
  it("turns RGB, CMYK and Lab into gray the way the PDF standard does", () => {
    close(toGray({ t: "rgb" }, [1, 0, 0]), 0.3);
    close(toGray({ t: "rgb" }, [0, 1, 0]), 0.59);
    close(toGray({ t: "cmyk" }, [0, 0, 0, 1]), 0);
    close(toGray({ t: "cmyk" }, [1, 0, 0, 0]), 0.7);
    close(toGray({ t: "lab" }, [50, 20, -10]), 0.5);
    close(toGray({ t: "indexed", base: { t: "rgb" }, hival: 1, lookup: new Uint8Array([255, 255, 255, 0, 0, 255]) }, [1]), 0.11);
  });

  it("evaluates exponential, stitching and PostScript functions", async () => {
    const doc = await PDFDocument.create();
    const ctx = doc.context;
    const exp = compileFunction(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0], C1: [1, 0.5, 0], N: 1 }));
    expect(exp?.([0.5])).toEqual([0.5, 0.25, 0]);
    const stitch = compileFunction(
      ctx.obj({ FunctionType: 3, Domain: [0, 1], Bounds: [0.5], Encode: [0, 1, 0, 1], Functions: [ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1 }), ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [1], C1: [0], N: 1 })] }),
    );
    expect(stitch?.([0.25])?.[0]).toBeCloseTo(0.5);
    expect(stitch?.([0.75])?.[0]).toBeCloseTo(0.5);
    const ps = ctx.flateStream("{ dup 0.5 gt { 1 exch sub } { 2 mul } ifelse 3 1 roll pop pop }", { FunctionType: 4, Domain: [0, 1, 0, 1, 0, 1], Range: [0, 1] });
    const fn = compileFunction(ps);
    expect(fn?.([0.2, 0, 0.75])?.[0]).toBeCloseTo(0.25);
    expect(fn?.([0.2, 0, 0.25])?.[0]).toBeCloseTo(0.5);
  });

  it("interpolates a sampled function", async () => {
    const doc = await PDFDocument.create();
    const sampled = doc.context.flateStream(new Uint8Array([0, 255, 255, 0]), { FunctionType: 0, Domain: [0, 1], Range: [0, 1, 0, 1], Size: [2], BitsPerSample: 8 });
    const fn = compileFunction(sampled);
    expect(fn?.([0.5])?.map((v) => Math.round(v * 100) / 100)).toEqual([0.5, 0.5]);
    expect(fn?.([1])).toEqual([1, 0]);
  });

  it("undoes PNG predictors", async () => {
    const doc = await PDFDocument.create();
    const parms = doc.context.obj({ Predictor: 12, Colors: 1, BitsPerComponent: 8, Columns: 3 }) as PDFDict;
    // Row 1 with the Sub filter (each byte adds the one before), row 2 with Up (adds the byte above).
    const data = new Uint8Array([1, 10, 5, 5, 2, 1, 1, 1]);
    expect(Array.from(unpredict(data, parms))).toEqual([10, 15, 20, 11, 16, 21]);
  });
});

describe("grayscalePdf", () => {
  it("rewrites RGB and CMYK operators and keeps text as text", async () => {
    const bytes = await pageWith("1 0 0 rg 0 0 50 50 re f 0 0 1 RG 10 w 0 0 m 100 100 l S 0 1 0 0 k 50 50 20 20 re f BT /F1 12 Tf 1 0 0 rg 20 150 Td (Red words) Tj ET", (doc) => ({ Font: { F1: doc.context.register(doc.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica" })) } }));
    const result = await grayscalePdf(bytes);
    const out = await content(result.data);
    expect(out).not.toMatch(/\b(rg|RG|k|K)\b/);
    expect(out).toContain("0.3 g 0 0 50 50 re f");
    expect(out).toContain("0.11 G");
    expect(out).toContain("0.41 g");
    expect(result.colors).toBe(4);
    expect(await readBack(result.data)).toBe("Red words");
  });

  it("converts spot colours through their tint transform and leaves All and None alone", async () => {
    const bytes = await pageWith("/CS0 cs 0.5 scn 0 0 10 10 re f /CS1 CS 1 SCN /CS2 cs 0.5 0.5 scn 0 0 5 5 re f", (doc) => {
      const ctx = doc.context;
      const tint = ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 0, 0, 1], N: 1 });
      const ps = ctx.flateStream("{ add 2 div 0 0 3 -1 roll 0 }", { FunctionType: 4, Domain: [0, 1, 0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1] });
      return {
        ColorSpace: {
          CS0: ctx.obj([PDFName.of("Separation"), PDFName.of("Pantone"), PDFName.of("DeviceCMYK"), tint]),
          CS1: ctx.obj([PDFName.of("Separation"), PDFName.of("All"), PDFName.of("DeviceCMYK"), tint]),
          CS2: ctx.obj([PDFName.of("DeviceN"), ctx.obj([PDFName.of("A"), PDFName.of("B")]), PDFName.of("DeviceCMYK"), ctx.register(ps)]),
        },
      };
    });
    const out = await content((await grayscalePdf(bytes)).data);
    expect(out).toContain("/DeviceGray cs 0.5 scn");
    expect(out).toContain("/DeviceGray CS 0 SCN");
    // DeviceN: (0, 0, 0.5, 0) in CMYK, so 1 - 0.11 * 0.5.
    expect(out).toContain("/DeviceGray cs 0.945 scn");
  });

  it("makes pictures gray: raw RGB, palette, and a colour-key mask kept as a soft mask", async () => {
    let rgbRef: PDFRef | undefined;
    let paletteRef: PDFRef | undefined;
    const bytes = await pageWith("q 100 0 0 100 0 0 cm /Im0 Do Q q 50 0 0 50 0 0 cm /Im1 Do Q", (doc) => {
      const ctx = doc.context;
      // Red, green and pure white (the white is keyed out).
      rgbRef = ctx.register(ctx.flateStream(new Uint8Array([255, 0, 0, 0, 255, 0, 255, 255, 255]), { Type: "XObject", Subtype: "Image", Width: 3, Height: 1, BitsPerComponent: 8, ColorSpace: "DeviceRGB", Mask: [250, 255, 250, 255, 250, 255] }));
      paletteRef = ctx.register(ctx.flateStream(new Uint8Array([0, 1]), { Type: "XObject", Subtype: "Image", Width: 2, Height: 1, BitsPerComponent: 8, ColorSpace: ctx.obj([PDFName.of("Indexed"), PDFName.of("DeviceRGB"), 1, PDFHexString.of("0000ffff0000")]) }));
      return { XObject: { Im0: rgbRef, Im1: paletteRef } };
    });
    const result = await grayscalePdf(bytes);
    expect(result.images).toBe(2);
    const doc = await PDFDocument.load(result.data);
    const rgb = (doc.context.lookup(rgbRef as PDFRef) as PDFRawStream);
    expect(rgb.dict.lookup(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceGray"));
    expect(Array.from(decodePDFRawStream(rgb).decode())).toEqual([77, 150, 255]);
    const smask = (rgb.dict.lookup(PDFName.of("SMask")) as PDFRawStream);
    expect(Array.from(decodePDFRawStream(smask).decode())).toEqual([255, 255, 0]);
    expect(rgb.dict.has(PDFName.of("Mask"))).toBe(false);
    const palette = (doc.context.lookup(paletteRef as PDFRef) as PDFRawStream).dict.lookup(PDFName.of("ColorSpace"), PDFArray);
    expect(palette.lookup(1)).toBe(PDFName.of("DeviceGray"));
    expect(Array.from((palette.lookup(3) as PDFHexString).asBytes())).toEqual([28, 77]);
  });

  it("gives a gradient a gray function", async () => {
    let shadingRef: PDFRef | undefined;
    const bytes = await pageWith("/Sh0 sh", (doc) => {
      const ctx = doc.context;
      shadingRef = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: "DeviceRGB", Coords: [0, 0, 200, 0], Function: ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 0, 1], N: 1 }), Extend: [true, true] }));
      return { Shading: { Sh0: shadingRef } };
    });
    const result = await grayscalePdf(bytes);
    expect(result.shadings).toBe(1);
    const doc = await PDFDocument.load(result.data);
    const shading = doc.context.lookup(shadingRef as PDFRef, PDFDict);
    expect(shading.lookup(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceGray"));
    const fn = compileFunction(shading.lookup(PDFName.of("Function")));
    expect(fn?.([0])?.[0]).toBeCloseTo(0.3, 1);
    expect(fn?.([1])?.[0]).toBeCloseTo(0.11, 1);
  });

  it("converts forms, inline images and annotation colours", async () => {
    let formRef: PDFRef | undefined;
    const bytes = await pageWith("/Fm0 Do BI /W 2 /H 1 /BPC 8 /CS /RGB ID \xff\x00\x00\x00\x00\xff EI Q", (doc, page) => {
      const ctx = doc.context;
      formRef = ctx.register(ctx.flateStream("0 1 0 rg 0 0 10 10 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 10, 10] }));
      const annot = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [10, 10, 50, 50], C: [1, 0, 0] }));
      page.node.set(PDFName.of("Annots"), ctx.obj([annot]));
      return { XObject: { Fm0: formRef } };
    });
    const result = await grayscalePdf(bytes);
    const doc = await PDFDocument.load(result.data);
    expect(decode(doc.context.lookup(formRef as PDFRef, PDFStream))).toBe("0.59 g 0 0 10 10 re f");
    const out = await content(result.data);
    expect(out).toContain("BI /W 2 /H 1 /BPC 8 /CS /G /F /AHx ID 4d1c> EI");
    const annot = doc.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray).lookup(0, PDFDict);
    expect(annot.lookup(PDFName.of("C"), PDFArray).asArray().map((x) => x.toString())).toEqual(["0.3"]);
  });

  it("snaps to black and white with a threshold", async () => {
    let imageRef: PDFRef | undefined;
    const bytes = await pageWith("0.8 g 0 0 1 1 re f 0.2 G 1 1 0 rg /Im0 Do", (doc) => {
      imageRef = doc.context.register(doc.context.flateStream(new Uint8Array([0, 100, 200, 255, 30, 220, 40, 90, 255]), { Type: "XObject", Subtype: "Image", Width: 9, Height: 1, BitsPerComponent: 8, ColorSpace: "DeviceGray" }));
      return { XObject: { Im0: imageRef } };
    });
    const result = await grayscalePdf(bytes, { mode: "bw" });
    const out = await content(result.data);
    expect(out).toContain("1 g 0 0 1 1 re f 0 G 1 g");
    const doc = await PDFDocument.load(result.data);
    const image = (doc.context.lookup(imageRef as PDFRef) as PDFRawStream);
    expect(image.dict.lookup(PDFName.of("BitsPerComponent"))?.toString()).toBe("1");
    // 0,100,200,255,30,220,40,90,255 -> 0,0,1,1,0,1,0,0,1 packed into two bytes.
    expect(Array.from(decodePDFRawStream(image).decode())).toEqual([0b00110100, 0b10000000]);
    await expect(grayscalePdf(bytes, { mode: "bw", threshold: 1 })).rejects.toThrow(/threshold/);
  });

  it("sends JPEGs through the codec, and counts them as kept without one", async () => {
    let jpegRef: PDFRef | undefined;
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = await pageWith("/Im0 Do", (doc) => {
      jpegRef = doc.context.register(doc.context.stream(fakeJpeg, { Type: "XObject", Subtype: "Image", Width: 2, Height: 1, BitsPerComponent: 8, ColorSpace: "DeviceRGB", Filter: "DCTDecode" }));
      return { XObject: { Im0: jpegRef } };
    });
    const without = await grayscalePdf(bytes);
    expect(without.kept.jpeg).toBe(1);

    let encoded: number[] = [];
    const codec: GrayImageCodec = {
      decodeJpeg: async () => ({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) }),
      encodeJpeg: async (rgba) => {
        encoded = Array.from(rgba);
        return new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]);
      },
    };
    const result = await grayscalePdf(bytes, { codec });
    expect(result.images).toBe(1);
    expect(encoded).toEqual([77, 77, 77, 255, 28, 28, 28, 255]);
    const doc = await PDFDocument.load(result.data);
    const image = (doc.context.lookup(jpegRef as PDFRef) as PDFRawStream);
    expect(Array.from(image.contents)).toEqual([0xff, 0xd8, 1, 0xff, 0xd9]);
  });

  it("keeps a real document readable", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    page.drawRectangle({ x: 10, y: 10, width: 100, height: 50, color: { type: "RGB", red: 0.1, green: 0.4, blue: 0.9 } as never });
    page.drawText("Quarterly report", { x: 20, y: 200, size: 18, font, color: { type: "RGB", red: 0.8, green: 0.1, blue: 0.1 } as never });
    const result = await grayscalePdf(await doc.save());
    expect(await readBack(result.data)).toBe("Quarterly report");
    expect(await content(result.data)).not.toMatch(/\brg\b/);
  });
});
