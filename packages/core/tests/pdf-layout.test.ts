import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, StandardFonts, degrees } from "pdf-lib";
import {
  bookletLayout,
  bookletOrder,
  bookletPdf,
  drawAnnotationAppearances,
  fitInto,
  nUpLayout,
  nUpPdf,
  placementMatrix,
  resizePdf,
  resizePlacement,
  SHEET_SIZES,
  targetSize,
  type Size,
} from "../src/pdf-layout";
import { readBack, readItems } from "./pdf-read-back";

const A4 = SHEET_SIZES.a4;
const LETTER = SHEET_SIZES.letter;
const near = (a: number, b: number, tolerance = 0.6) => Math.abs(a - b) <= tolerance;

/** `count` pages of `size`, each with its label ("P1", "P2"…) written at (50, size.height - 142). */
async function labelled(count: number, size: Size = A4, build?: (doc: PDFDocument) => void | Promise<void>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let k = 0; k < count; k++) {
    const page = doc.addPage([size.width, size.height]);
    page.drawText(`P${k + 1}`, { x: 50, y: size.height - 142, size: 20, font });
  }
  await build?.(doc);
  return doc.save();
}

const item = async (bytes: Uint8Array, page: number, str: string) => {
  const found = (await readItems(bytes, page)).find((i) => i.str === str);
  if (!found) throw new Error(`${str} not found on sheet ${page}`);
  return found;
};

describe("fitInto", () => {
  it("scales to fit, centred, and turns only when that is clearly bigger", () => {
    expect(fitInto({ width: 200, height: 100 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({ turn: 0, scale: 0.5, x: 0, y: 25, width: 100, height: 50 });
    const turned = fitInto({ width: 200, height: 100 }, { x: 0, y: 0, width: 100, height: 200 }, { allowTurn: true });
    expect(turned).toMatchObject({ turn: 270, scale: 1, width: 100, height: 200 });
    expect(fitInto({ width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 200 }, { allowTurn: true }).turn).toBe(0);
  });

  it("aligns to either side, and covers when asked", () => {
    expect(fitInto({ width: 50, height: 100 }, { x: 10, y: 0, width: 100, height: 100 }, { align: "start" }).x).toBe(10);
    expect(fitInto({ width: 50, height: 100 }, { x: 10, y: 0, width: 100, height: 100 }, { align: "end" }).x).toBe(60);
    expect(fitInto({ width: 200, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }, { cover: true })).toMatchObject({ scale: 1, x: -50, y: 0 });
  });
});

describe("nUpLayout", () => {
  const pages = (n: number, s: Size = A4) => Array.from({ length: n }, () => s);

  it("puts 4 A4 pages on a portrait A4 sheet at half size, across then down", () => {
    const layout = nUpLayout(pages(6), { perSheet: 4 });
    expect(layout.sheet).toEqual(A4);
    expect(layout.sides).toHaveLength(2);
    const [a, b, c, d] = layout.sides[0]!.placements;
    expect(a).toMatchObject({ page: 0, turn: 0, scale: 0.5 });
    expect(near(b!.x, A4.width / 2) && near(b!.y, a!.y)).toBe(true);
    expect(near(c!.x, 0) && near(c!.y, 0)).toBe(true);
    expect(d!.page).toBe(3);
    expect(layout.sides[1]!.placements.map((p) => p.page)).toEqual([4, 5]);
  });

  it("puts 2 portrait pages side by side on a landscape sheet", () => {
    const layout = nUpLayout(pages(2), { perSheet: 2, sheet: "a4" });
    expect(layout.sheet.width).toBeGreaterThan(layout.sheet.height);
    expect(layout.sides[0]!.placements.map((p) => [p.turn, Math.round(p.x)])).toEqual([
      [0, 0],
      [0, 421],
    ]);
  });

  it("orders pages down then across, or right to left", () => {
    const down = nUpLayout(pages(4), { perSheet: 4, order: "down" }).sides[0]!.placements;
    expect(near(down[1]!.x, 0) && down[1]!.y < down[0]!.y).toBe(true);
    const rtl = nUpLayout(pages(4), { perSheet: 4, order: "across-rtl" }).sides[0]!.placements;
    expect(rtl[0]!.x).toBeGreaterThan(rtl[1]!.x);
  });

  it("turns pages that fit their space better the other way, unless asked not to", () => {
    const turned = nUpLayout(pages(4), { perSheet: 4, orientation: "landscape" }).sides[0]!.placements[0]!;
    expect(turned.turn).toBe(270);
    expect(turned.scale).toBeCloseTo(0.5, 2);
    expect(nUpLayout(pages(4), { perSheet: 4, orientation: "landscape", autoTurn: false }).sides[0]!.placements[0]!.turn).toBe(0);
  });

  it("keeps margins and gaps clear", () => {
    const layout = nUpLayout(pages(4), { perSheet: 4, margin: 20, gap: 10 });
    const [a, b] = layout.sides[0]!.placements;
    expect(a!.x).toBeGreaterThanOrEqual(20);
    expect(b!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(10 - 0.01);
    expect(() => nUpLayout(pages(4), { perSheet: 16, margin: 300 })).toThrow(/no room/);
  });

  it("repeats each page to fill a sheet", () => {
    const layout = nUpLayout(pages(3), { perSheet: 8, repeat: true });
    expect(layout.sides.map((s) => s.placements.map((p) => p.page))).toEqual([Array(8).fill(0), Array(8).fill(1), Array(8).fill(2)]);
  });
});

describe("bookletOrder", () => {
  it("imposes 4 pages as 4|1 and 2|3", () => {
    expect(bookletOrder(4).sides).toEqual([
      [3, 0],
      [1, 2],
    ]);
  });

  it("rounds up with blank pages at the end, or before the back cover", () => {
    expect(bookletOrder(5)).toEqual({
      sides: [
        [null, 0],
        [1, null],
        [null, 2],
        [3, 4],
      ],
      blanks: 3,
      sections: 1,
    });
    expect(bookletOrder(5, { blanks: "before-back" }).sides).toEqual([
      [4, 0],
      [1, null],
      [null, 2],
      [3, null],
    ]);
  });

  it("swaps the halves for a right-hand binding", () => {
    expect(bookletOrder(4, { binding: "right" }).sides).toEqual([
      [0, 3],
      [2, 1],
    ]);
  });

  it("folds long booklets in sections", () => {
    const order = bookletOrder(20, { section: 16 });
    expect(order.sections).toBe(2);
    expect(order.blanks).toBe(0);
    expect(order.sides[0]).toEqual([15, 0]);
    expect(order.sides[8]).toEqual([19, 16]);
    expect(() => bookletOrder(20, { section: 10 })).toThrow(/multiple of 4/);
  });

  it("uses every page exactly once for any length", () => {
    for (let n = 1; n <= 41; n++) {
      for (const section of [0, 8]) {
        const { sides, blanks } = bookletOrder(n, { section });
        const all = sides.flat();
        expect(all.length % 4).toBe(0);
        expect(all.filter((p) => p === null)).toHaveLength(blanks);
        expect(all.filter((p): p is number => p !== null).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });
});

describe("bookletLayout", () => {
  it("puts pages against the fold and labels each side", () => {
    const layout = bookletLayout([A4, A4, { width: 400, height: 600 }, A4], { sheet: "a4", gutter: 6 });
    expect(layout.sheet.width).toBeGreaterThan(layout.sheet.height);
    const [front, back] = layout.sides;
    expect(front!.label).toBe("Sheet 1, front");
    expect(back!.label).toBe("Sheet 1, back");
    const half = layout.sheet.width / 2;
    const [left, right] = front!.placements;
    expect(near(left!.x + left!.width, half - 6)).toBe(true);
    expect(near(right!.x, half + 6)).toBe(true);
  });

  it("makes the sheet two pages wide by default", () => {
    expect(bookletLayout([A4, A4]).sheet).toEqual({ width: A4.width * 2, height: A4.height });
  });
});

describe("placementMatrix", () => {
  it("maps the page corners onto the placed box for each turn", () => {
    const box = { width: 100, height: 50 };
    const apply = (m: number[], x: number, y: number) => [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
    for (const turn of [0, 90, 180, 270] as const) {
      const m = placementMatrix(box, turn, 2, 10, 20);
      const corners = [apply(m, 0, 0), apply(m, 100, 0), apply(m, 0, 50), apply(m, 100, 50)];
      const xs = corners.map((c) => c[0]!);
      const ys = corners.map((c) => c[1]!);
      const sideways = turn === 90 || turn === 270;
      expect([Math.min(...xs), Math.min(...ys)]).toEqual([10, 20]);
      expect([Math.max(...xs) - 10, Math.max(...ys) - 20]).toEqual(sideways ? [100, 200] : [200, 100]);
    }
    // Turned clockwise, the top-left of the page ends up top-right.
    expect(apply(placementMatrix(box, 90, 1, 0, 0), 0, 50)).toEqual([50, 100]);
  });
});

describe("nUpPdf", () => {
  it("draws the real pages (text still text) in their cells", async () => {
    const { data, sheets } = await nUpPdf(await labelled(5), { perSheet: 4 });
    expect(sheets).toBe(2);
    const out = await PDFDocument.load(data);
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getSize()).toEqual({ width: A4.width, height: A4.height });
    const top = A4.height / 2;
    const p1 = await item(data, 1, "P1");
    const p2 = await item(data, 1, "P2");
    const p3 = await item(data, 1, "P3");
    expect(near(p1.x, 25) && near(p1.y, top + (A4.height - 142) / 2)).toBe(true);
    expect(near(p2.x, A4.width / 2 + 25)).toBe(true);
    expect(near(p3.x, 25) && near(p3.y, (A4.height - 142) / 2)).toBe(true);
    expect(await readBack(data, 2)).toBe("P5");
  });

  it("shows rotated pages the way they are shown, not as stored", async () => {
    const bytes = await labelled(2, A4, (doc) => doc.getPages().forEach((p) => p.setRotation(degrees(90))));
    const { data } = await nUpPdf(bytes, { perSheet: 2 });
    const sheet = (await PDFDocument.load(data)).getPage(0);
    // Two landscape pages stack on a portrait sheet.
    expect(sheet.getHeight()).toBeGreaterThan(sheet.getWidth());
    const scale = A4.width / A4.height;
    // On a page turned clockwise, the point (x, y) shows at (y, width - x).
    const shown = { x: A4.height - 142, y: A4.width - 50 };
    const p1 = await item(data, 1, "P1");
    expect(near(p1.x, shown.x * scale, 1.5)).toBe(true);
    expect(near(p1.y, A4.height / 2 + shown.y * scale, 1.5)).toBe(true);
  });

  it("keeps filled-in form fields, draws borders and skips pages with no content", async () => {
    const bytes = await labelled(1, A4, (doc) => {
      const field = doc.getForm().createTextField("name");
      field.setText("Hello field");
      field.addToPage(doc.getPage(0), { x: 50, y: 400, width: 200, height: 30 });
      doc.addPage([A4.width, A4.height]);
    });
    const { data } = await nUpPdf(bytes, { perSheet: 2, border: true });
    expect(await readBack(data)).toContain("Hello field");
    const without = await nUpPdf(bytes, { perSheet: 2, keepAnnotations: false });
    expect(await readBack(without.data)).not.toContain("Hello field");
  });

  it("makes only the sides asked for, for a preview", async () => {
    const { data } = await nUpPdf(await labelled(9), { perSheet: 2, onlySides: [2] });
    expect((await PDFDocument.load(data)).getPageCount()).toBe(1);
    expect(await readBack(data)).toBe("P5P6");
  });
});

describe("bookletPdf", () => {
  it("prints page 4 beside page 1 on the front of the first sheet", async () => {
    const result = await bookletPdf(await labelled(4), { sheet: "a4" });
    expect(result).toMatchObject({ sheets: 1, blanks: 0, sections: 1 });
    const p4 = await item(result.data, 1, "P4");
    const p1 = await item(result.data, 1, "P1");
    expect(p4.x).toBeLessThan(p1.x);
    expect(await readBack(result.data, 2)).toBe("P2P3");
  });

  it("counts the blank pages it adds", async () => {
    const result = await bookletPdf(await labelled(6));
    expect(result).toMatchObject({ sheets: 2, blanks: 2 });
    expect((await PDFDocument.load(result.data)).getPageCount()).toBe(4);
  });
});

describe("drawAnnotationAppearances", () => {
  it("draws visible appearances and skips hidden ones", async () => {
    const bytes = await labelled(1, A4, (doc) => {
      const form = doc.getForm();
      const a = form.createTextField("a");
      a.setText("Shown");
      a.addToPage(doc.getPage(0), { x: 10, y: 10 });
      const b = form.createTextField("b");
      b.setText("Hidden");
      b.addToPage(doc.getPage(0), { x: 10, y: 100, hidden: true });
    });
    const doc = await PDFDocument.load(bytes);
    expect(drawAnnotationAppearances(doc, [0])).toBe(1);
  });
});

describe("resize", () => {
  it("works out the new page size and where the content goes", () => {
    expect(targetSize({ width: 800, height: 600 }, "a4")).toEqual({ width: A4.height, height: A4.width });
    expect(targetSize({ width: 800, height: 600 }, "a4", "portrait")).toEqual(A4);
    const fit = resizePlacement(LETTER, A4, "fit");
    expect(fit.scale).toBeCloseTo(A4.width / LETTER.width, 4);
    expect(fit.x).toBeCloseTo(0, 4);
    const fill = resizePlacement(LETTER, A4, "fill");
    expect(fill.scale).toBeCloseTo(A4.height / LETTER.height, 4);
    expect(fill.x).toBeLessThan(0);
    expect(resizePlacement(LETTER, A4, "none")).toMatchObject({ scale: 1, width: LETTER.width });
    expect(() => resizePlacement(LETTER, A4, "fit", 400)).toThrow(/no room/);
  });

  it("turns Letter pages into A4, scaling and centring the content", async () => {
    const { data, resized } = await resizePdf(await labelled(2, LETTER), { size: "a4" });
    expect(resized).toBe(2);
    const out = await PDFDocument.load(data);
    expect(out.getPage(0).getSize()).toEqual({ width: A4.width, height: A4.height });
    const s = A4.width / LETTER.width;
    const oy = (A4.height - LETTER.height * s) / 2;
    const p1 = await item(data, 1, "P1");
    expect(near(p1.x, 50 * s) && near(p1.y, oy + (LETTER.height - 142) * s)).toBe(true);
  });

  it("only resizes the pages asked for, keeps rotation, and moves links with the content", async () => {
    const bytes = await labelled(2, LETTER, (doc) => {
      const page = doc.getPage(1);
      page.setRotation(degrees(90));
      const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [100, 100, 200, 120] });
      page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(link)]));
    });
    const { data } = await resizePdf(bytes, { size: "a4", fit: "fit", pageIndexes: [1] });
    const out = await PDFDocument.load(data);
    expect(out.getPage(0).getSize()).toEqual({ width: LETTER.width, height: LETTER.height });
    const page = out.getPage(1);
    expect(page.getRotation().angle).toBe(90);
    // Shown landscape (turned), so stored portrait A4.
    expect(page.getSize()).toEqual({ width: A4.width, height: A4.height });
    const s = A4.width / LETTER.width;
    const oy = (A4.height - LETTER.height * s) / 2;
    const annot = page.node.Annots()!.lookup(0, PDFDict);
    const numbers = (annot.lookup(PDFName.of("Rect"), PDFArray).asArray() as PDFNumber[]).map((n) => n.asNumber());
    expect(numbers.map((n) => Math.round(n * 10) / 10)).toEqual([100 * s, oy + 100 * s, 200 * s, oy + 120 * s].map((n) => Math.round(n * 10) / 10));
  });

  it("refuses sizes that make no sense", async () => {
    const bytes = await labelled(1);
    await expect(resizePdf(bytes, { size: { width: 5, height: 5 } })).rejects.toThrow(/page size/);
    await expect(resizePdf(bytes, { size: "a4", pageIndexes: [3] })).rejects.toThrow(/does not exist/);
  });
});
