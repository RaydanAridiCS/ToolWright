import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";
import { PDFDict, PDFDocument as Pdf, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { checkPrintable, createTextPainter, fontFileName, woffToSfnt, type FontLoader } from "../src/pdf-text";
import { fontsFromDisk, readBack } from "./pdf-read-back";

const fromDisk = fontsFromDisk;

async function draw(text: string, options: { bold?: boolean; loadFont?: FontLoader; rotate?: number } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const painter = await createTextPainter(doc, text, options);
  painter.draw(page, { x: 40, y: 150, size: 18, rotate: options.rotate ?? 0 });
  return { painter, bytes: await doc.save() };
}

describe("createTextPainter", () => {
  it("keeps using the standard font, and loads nothing, for text it can print", async () => {
    const loader = vi.fn(fromDisk);
    const { bytes } = await draw("Café résumé 2024 – naïve", { loadFont: loader });
    expect(loader).not.toHaveBeenCalled();
    expect(bytes.length).toBeLessThan(2500);
    expect(await readBack(bytes)).toBe("Café résumé 2024 – naïve");
  });

  it("prints Russian, Greek, Polish and Vietnamese, and the text can be read back", async () => {
    for (const text of ["Конфиденциально", "Εμπιστευτικό", "Zażółć gęślą jaźń", "Tiếng Việt đẹp"]) {
      const { bytes } = await draw(text, { loadFont: fromDisk });
      expect(await readBack(bytes)).toBe(text);
    }
  });

  it("mixes scripts in one text and embeds only what is used", async () => {
    const loaded: string[] = [];
    const { bytes, painter } = await draw("DRAFT Черновик Σχέδιο", {
      loadFont: async (subset, weight) => {
        loaded.push(subset);
        return fromDisk(subset, weight);
      },
    });
    expect(await readBack(bytes)).toBe("DRAFT Черновик Σχέδιο");
    expect(painter.width(18)).toBeGreaterThan(painter.width(9));
    // Three small single-script fonts, so the file stays small.
    expect(bytes.length).toBeLessThan(60_000);
    expect(loaded).toContain("cyrillic");
    expect(loaded).toContain("greek");
  });

  it("measures text in proportion to its size", async () => {
    const { painter } = await draw("Привет мир", { loadFont: fromDisk });
    expect(painter.width(20) / painter.width(10)).toBeCloseTo(2, 5);
  });

  it("draws bold text from the bold files", async () => {
    const weights: number[] = [];
    await draw("Тест", {
      bold: true,
      loadFont: async (subset, weight) => {
        weights.push(weight);
        return fromDisk(subset, weight);
      },
    });
    expect(new Set(weights)).toEqual(new Set([700]));
  });

  it("draws rotated text without error", async () => {
    const { bytes } = await draw("Черновик", { loadFont: fromDisk, rotate: 45 });
    expect(await readBack(bytes)).toBe("Черновик");
  });

  it("names the characters that no font covers", async () => {
    await expect(draw("Hello 名前 and مرحبا", { loadFont: fromDisk })).rejects.toThrow(/has characters that cannot be printed: 名 前 م ر and 3 more/);
  });

  it("says so when a font is needed but cannot be loaded", async () => {
    await expect(draw("Привет", { loadFont: async () => Promise.reject(new Error("offline")) })).rejects.toThrow(/font for this text could not be loaded/);
  });

  it("refuses non-standard text when no loader is given", async () => {
    await expect(draw("Привет")).rejects.toThrow(/standard PDF font cannot print/);
  });

  it("turns line breaks and tabs into spaces instead of missing-glyph boxes", async () => {
    const { bytes } = await draw("Один\nДва\tТри", { loadFont: fromDisk });
    expect(await readBack(bytes)).toBe("Один Два Три");
  });
});

describe("checkPrintable", () => {
  it("accepts supported text and rejects the rest", async () => {
    await expect(checkPrintable("Привет", fromDisk)).resolves.toBeUndefined();
    await expect(checkPrintable("名前", fromDisk)).rejects.toThrow(/cannot be printed/);
  });
});

describe("woffToSfnt", () => {
  const woff = (subset: "latin" | "cyrillic") => new Uint8Array(readFileSync(new URL(`../../../apps/web/node_modules/@fontsource/noto-sans/files/${fontFileName(subset, 400)}`, import.meta.url)));

  it("unwraps a WOFF into a TrueType file that fontkit reads the same way", async () => {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    for (const subset of ["latin", "cyrillic"] as const) {
      const sfnt = await woffToSfnt(woff(subset));
      expect([...sfnt.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
      const font = fontkit.create(sfnt);
      expect(font.numGlyphs).toBeGreaterThan(100);
      expect(font.hasGlyphForCodePoint(subset === "latin" ? 0x41 : 0x416)).toBe(true);
    }
  });

  it("refuses files that are not WOFF or are cut short", async () => {
    await expect(woffToSfnt(new Uint8Array(60))).rejects.toThrow(/not a WOFF/);
    await expect(woffToSfnt(woff("latin").subarray(0, 300))).rejects.toThrow(/damaged/);
  });

  it("puts a real TrueType file, not a WOFF, inside the PDF", async () => {
    const doc = await Pdf.create();
    const page = doc.addPage([300, 200]);
    const painter = await createTextPainter(doc, "Привет", { loadFont: fontsFromDisk });
    painter.draw(page, { x: 20, y: 100, size: 18 });
    const out = await Pdf.load(await doc.save({ useObjectStreams: false }), { updateMetadata: false });
    const magics: number[][] = [];
    for (const [, object] of out.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict) || !object.has(PDFName.of("FontFile2"))) continue;
      const file = out.context.lookup(object.get(PDFName.of("FontFile2")));
      if (file instanceof PDFRawStream) magics.push([...decodePDFRawStream(file).decode().subarray(0, 4)]);
    }
    expect(magics.length).toBeGreaterThan(0);
    // 0x00010000, or "true" when fontkit writes a subset: both are TrueType; a WOFF would start "wOFF".
    for (const m of magics) expect([[0, 1, 0, 0], [0x74, 0x72, 0x75, 0x65]]).toContainEqual(m);
  });
});
