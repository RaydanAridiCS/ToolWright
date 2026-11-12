import { describe, expect, it } from "vitest";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import {
  DEFAULT_BATES,
  addHeaderFooter,
  checkBates,
  choosePages,
  expandTokens,
  formatBates,
  layoutRow,
  usesBates,
  zonesForPage,
  type PageContext,
} from "../src/pdf-header-footer";
import { fontsFromDisk, readBack, readItems } from "./pdf-read-back";

async function makePdf(pages = 3, size: [number, number] = [612, 792]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage(size).drawText(`Body ${i + 1}`, { x: 250, y: 400, size: 12, font });
  return doc.save();
}

const ctx = (extra: Partial<PageContext> = {}): PageContext => ({ index: 0, pageCount: 10, startAt: 1, stampedBefore: 0, date: "2026-03-15", fileName: "contract", ...extra });

describe("expandTokens", () => {
  it("fills in every token", () => {
    const bates = { prefix: "ACME-", start: 100, digits: 6, suffix: "" };
    expect(expandTokens("{file} · Page {page} of {pages} · {date} · {bates}", ctx({ index: 2, bates, stampedBefore: 2 }))).toBe("contract · Page 3 of 10 · 2026-03-15 · ACME-000102");
  });
  it("counts from the chosen starting number, and the total moves with it", () => {
    expect(expandTokens("{page}/{pages}", ctx({ index: 0, startAt: 5, pageCount: 4 }))).toBe("5/8");
    expect(expandTokens("{page}", ctx({ index: 3, startAt: 0 }))).toBe("3");
  });
  it("ignores case and leaves other braces alone", () => {
    expect(expandTokens("{PAGE} {Page} {other} {}", ctx())).toBe("1 1 {other} {}");
  });
  it("prints nothing for a Bates token when Bates numbering is not set up", () => {
    expect(expandTokens("[{bates}]", ctx())).toBe("[]");
  });
});

describe("Bates numbers", () => {
  it("pads, adds the prefix and suffix, and never cuts a long number", () => {
    expect(formatBates({ prefix: "ACME-", start: 1, digits: 6, suffix: "" }, 123)).toBe("ACME-000123");
    expect(formatBates({ prefix: "", start: 1, digits: 3, suffix: "-A" }, 7)).toBe("007-A");
    expect(formatBates({ prefix: "", start: 1, digits: 3, suffix: "" }, 12345)).toBe("12345");
  });
  it("checks its settings", () => {
    expect(() => checkBates(DEFAULT_BATES)).not.toThrow();
    expect(() => checkBates({ ...DEFAULT_BATES, start: -1 })).toThrow(/whole number/);
    expect(() => checkBates({ ...DEFAULT_BATES, start: 1.5 })).toThrow(/whole number/);
    expect(() => checkBates({ ...DEFAULT_BATES, digits: 0 })).toThrow(/1 to 12 digits/);
    expect(() => checkBates({ ...DEFAULT_BATES, digits: 13 })).toThrow(/1 to 12 digits/);
    expect(() => checkBates({ ...DEFAULT_BATES, prefix: "x".repeat(31) })).toThrow(/at most 30/);
  });
  it("is detected in the zones", () => {
    expect(usesBates({ "footer-right": "{BATES}" })).toBe(true);
    expect(usesBates({ "footer-right": "{page}" })).toBe(false);
  });
});

describe("zonesForPage", () => {
  const zones = { "header-left": "A", "header-right": "B", "footer-left": "C", "footer-right": "D", "footer-center": "M" };
  it("swaps left and right on even pages only when mirroring", () => {
    expect(zonesForPage(zones, 1, false)).toBe(zones);
    expect(zonesForPage(zones, 0, true)).toBe(zones);
    expect(zonesForPage(zones, 1, true)).toMatchObject({ "header-left": "B", "header-right": "A", "footer-left": "D", "footer-right": "C", "footer-center": "M" });
  });
});

describe("layoutRow", () => {
  it("puts the pieces at the margins and the middle", () => {
    expect(layoutRow(600, 40, { left: 100, center: 80, right: 120 })).toEqual({ left: 40, center: 260, right: 440 });
  });
  it("names the pieces that run into each other", () => {
    expect(layoutRow(600, 40, { left: 300, center: 100 }).problem).toMatch(/left and middle text run into each other/);
    expect(layoutRow(600, 40, { center: 200, right: 200 }).problem).toMatch(/middle and right/);
    expect(layoutRow(300, 40, { left: 150, right: 150 }).problem).toMatch(/left and right/);
  });
  it("names a piece that does not fit the page", () => {
    expect(layoutRow(300, 40, { center: 400 }).problem).toMatch(/middle text is wider than the page/);
    expect(layoutRow(300, 40, { right: 280 }).problem).toMatch(/right text is wider/);
  });
});

describe("addHeaderFooter", () => {
  it("prints page numbers with their count, in the footer middle, and the header text at the top", async () => {
    const out = await addHeaderFooter(await makePdf(3), { zones: { "footer-center": "Page {page} of {pages}", "header-left": "{file}" }, fileName: "contract" });
    expect(await readBack(out, 1)).toContain("Page 1 of 3");
    expect(await readBack(out, 3)).toContain("Page 3 of 3");
    expect(await readBack(out, 2)).toContain("contract");
    const items = await readItems(out, 1);
    const footer = items.find((i) => i.str === "Page 1 of 3")!;
    const header = items.find((i) => i.str === "contract")!;
    // Centred, near the bottom; and at the left margin, near the top.
    expect(footer.x + footer.width / 2).toBeCloseTo(306, 0);
    expect(footer.y).toBeLessThan(60);
    expect(header.x).toBeCloseTo(36, 0);
    expect(header.y).toBeGreaterThan(792 - 60);
  });

  it("puts the right-hand text against the right margin", async () => {
    const out = await addHeaderFooter(await makePdf(1), { zones: { "footer-right": "end" }, margin: 50 });
    const item = (await readItems(out, 1)).find((i) => i.str === "end")!;
    expect(item.x + item.width).toBeCloseTo(612 - 50, 0);
  });

  it("stamps Bates numbers in order on the pages chosen, counting only those pages", async () => {
    const out = await addHeaderFooter(await makePdf(4), {
      zones: { "footer-right": "{bates}" },
      bates: { prefix: "ACME-", start: 101, digits: 6, suffix: "" },
      pages: [1, 2, 3],
    });
    expect(await readBack(out, 1)).not.toContain("ACME");
    expect(await readBack(out, 2)).toContain("ACME-000101");
    expect(await readBack(out, 3)).toContain("ACME-000102");
    expect(await readBack(out, 4)).toContain("ACME-000103");
  });

  it("counts the page number from the document, whichever pages are stamped", async () => {
    const out = await addHeaderFooter(await makePdf(3), { zones: { "footer-center": "{page}" }, pages: [1, 2], startAt: 10 });
    expect((await readBack(out, 1)).includes("10")).toBe(false);
    expect(await readBack(out, 2)).toContain("11");
    expect(await readBack(out, 3)).toContain("12");
  });

  it("swaps sides on even pages when mirroring", async () => {
    const out = await addHeaderFooter(await makePdf(2), { zones: { "footer-left": "inner" }, mirror: true });
    const first = (await readItems(out, 1)).find((i) => i.str === "inner")!;
    const second = (await readItems(out, 2)).find((i) => i.str === "inner")!;
    expect(first.x).toBeCloseTo(36, 0);
    expect(second.x + second.width).toBeCloseTo(612 - 36, 0);
  });

  it("keeps the text upright on a turned page and inside a cropped one", async () => {
    const doc = await PDFDocument.create();
    const turned = doc.addPage([600, 400]);
    turned.setRotation(degrees(90));
    const cropped = doc.addPage([600, 800]);
    cropped.setCropBox(100, 100, 300, 400);
    const out = await addHeaderFooter(await doc.save(), { zones: { "footer-center": "hello" } });
    expect(await readBack(out, 1)).toBe("hello");
    const item = (await readItems(out, 2)).find((i) => i.str === "hello")!;
    // The crop box runs from x = 100 to 400 and from y = 100 up: the text sits in it, near the bottom.
    expect(item.x).toBeGreaterThan(100);
    expect(item.x + item.width).toBeLessThan(400);
    expect(item.y).toBeGreaterThan(100);
    expect(item.y).toBeLessThan(160);
  });

  it("prints Cyrillic text when it is given the fonts, and refuses it without", async () => {
    const zones = { "header-center": "КОНФИДЕНЦИАЛЬНО" };
    const out = await addHeaderFooter(await makePdf(2), { zones, loadFont: fontsFromDisk });
    expect(await readBack(out, 2)).toContain("КОНФИДЕНЦИАЛЬНО");
    await expect(addHeaderFooter(await makePdf(1), { zones })).rejects.toThrow(/Header, middle on page 1 has characters the standard PDF font cannot print/);
  });

  it("uses the date and file name it is given", async () => {
    const out = await addHeaderFooter(await makePdf(1), { zones: { "header-right": "{date}", "footer-left": "{file}" }, date: "15 March 2026", fileName: "Lease" });
    const text = await readBack(out, 1);
    expect(text).toContain("15 March 2026");
    expect(text).toContain("Lease");
  });

  it("does not change the original bytes", async () => {
    const original = await makePdf(2);
    const copy = original.slice();
    await addHeaderFooter(original, { zones: { "footer-center": "{page}" } });
    expect(original).toEqual(copy);
  });

  it("explains each kind of mistake", async () => {
    const bytes = await makePdf(2);
    await expect(addHeaderFooter(bytes, { zones: {} })).rejects.toThrow(/at least one of the six boxes/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "   " } })).rejects.toThrow(/at least one of the six boxes/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "x".repeat(201) } })).rejects.toThrow(/Footer, left is longer than 200/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "x" }, fontSize: 2 })).rejects.toThrow(/between 4 and 72/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "x" }, margin: -1 })).rejects.toThrow(/margin must be between/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "x" }, startAt: 1.5 })).rejects.toThrow(/whole number/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "{bates}" }, bates: { ...DEFAULT_BATES, digits: 0 } })).rejects.toThrow(/1 to 12 digits/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "x" }, pages: [] })).rejects.toThrow(/No pages are selected/);
    await expect(addHeaderFooter(bytes, { zones: { "footer-left": "x" }, pages: [7] })).rejects.toThrow(/Page 8 does not exist/);
    await expect(addHeaderFooter(new Uint8Array([1, 2, 3, 4]), { zones: { "footer-left": "x" } })).rejects.toThrow();
  });

  it("says which page and row have text that runs together", async () => {
    await expect(
      addHeaderFooter(await makePdf(1, [200, 300]), { zones: { "footer-left": "A fairly long left piece", "footer-right": "and a long right piece" }, fontSize: 12 }),
    ).rejects.toThrow(/On page 1, the footer: the left and right text run into each other/);
  });
});

describe("choosePages", () => {
  it("picks all, odd or even pages counting from 1", () => {
    expect(choosePages("all", "", 4, false)).toEqual([0, 1, 2, 3]);
    expect(choosePages("odd", "", 5, false)).toEqual([0, 2, 4]);
    expect(choosePages("even", "", 5, false)).toEqual([1, 3]);
  });
  it("reads a list, and can leave out the first page", () => {
    expect(choosePages("custom", "2-3, 5", 6, false)).toEqual([1, 2, 4]);
    expect(choosePages("all", "", 3, true)).toEqual([1, 2]);
    expect(choosePages("custom", "1-3", 6, true)).toEqual([1, 2]);
  });
  it("explains an empty or wrong choice", () => {
    expect(() => choosePages("all", "", 1, true)).toThrow(/No pages are selected/);
    expect(() => choosePages("even", "", 1, false)).toThrow(/No pages are selected/);
    expect(() => choosePages("custom", "9", 3, false)).toThrow(/out of range/);
    expect(() => choosePages("custom", "x", 3, false)).toThrow(/not a page or a range/);
  });
});
