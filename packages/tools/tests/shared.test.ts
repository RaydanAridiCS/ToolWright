import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { errorMessage, formatInt, formatMinutes, formatMoney, formatPercent, pluralize } from "../src/shared/format";
import { FORMAT_EXTENSIONS, fitWithin, outputName } from "../src/shared/image";
import { num } from "../src/shared/number-field";
import { createZip } from "../src/shared/zip";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("createZip", () => {
  it("creates a valid archive whose entries round-trip", () => {
    const zip = createZip([
      { name: "a.txt", data: bytes("hello") },
      { name: "b.bin", data: Uint8Array.from([0, 1, 2, 255]) },
    ]);
    const entries = unzipSync(zip);
    expect(Object.keys(entries).sort()).toEqual(["a.txt", "b.bin"]);
    expect(new TextDecoder().decode(entries["a.txt"])).toBe("hello");
    expect([...entries["b.bin"]!]).toEqual([0, 1, 2, 255]);
  });

  it("renames duplicates instead of overwriting them", () => {
    const zip = createZip([
      { name: "photo.jpg", data: bytes("1") },
      { name: "photo.jpg", data: bytes("2") },
      { name: "photo.jpg", data: bytes("3") },
      { name: "README", data: bytes("x") },
      { name: "README", data: bytes("y") },
    ]);
    const entries = unzipSync(zip);
    expect(Object.keys(entries).sort()).toEqual(["README", "README (2)", "photo (2).jpg", "photo (3).jpg", "photo.jpg"]);
    expect(new TextDecoder().decode(entries["photo (3).jpg"])).toBe("3");
  });

  it("handles an empty list and unicode names", () => {
    expect(Object.keys(unzipSync(createZip([])))).toEqual([]);
    expect(Object.keys(unzipSync(createZip([{ name: "réport 📄.pdf", data: bytes("x") }])))).toEqual(["réport 📄.pdf"]);
  });
});

describe("fitWithin", () => {
  it("keeps the aspect ratio when fitting to a width, height or both", () => {
    expect(fitWithin(2000, 1000, { maxWidth: 500 })).toEqual({ width: 500, height: 250 });
    expect(fitWithin(2000, 1000, { maxHeight: 100 })).toEqual({ width: 200, height: 100 });
    expect(fitWithin(2000, 1000, { maxWidth: 1000, maxHeight: 100 })).toEqual({ width: 200, height: 100 });
  });
  it("never enlarges unless asked to", () => {
    expect(fitWithin(300, 200, { maxWidth: 1000 })).toEqual({ width: 300, height: 200 });
    expect(fitWithin(300, 200, { maxWidth: 600, noUpscale: false })).toEqual({ width: 600, height: 400 });
  });
  it("returns the original size without limits and never collapses to zero", () => {
    expect(fitWithin(640, 480, {})).toEqual({ width: 640, height: 480 });
    expect(fitWithin(640, 480, { maxWidth: 0, maxHeight: 0 })).toEqual({ width: 640, height: 480 });
    expect(fitWithin(5000, 10, { maxWidth: 10 })).toEqual({ width: 10, height: 1 });
  });
});

describe("outputName", () => {
  it("swaps the extension for the output format and adds a suffix", () => {
    expect(outputName("holiday.photo.png", "image/webp")).toBe("holiday.photo.webp");
    expect(outputName("a.jpeg", "image/jpeg", "-compressed")).toBe("a-compressed.jpg");
    expect(outputName("noext", "image/png")).toBe("noext.png");
    expect(outputName(".hidden", "image/avif")).toBe(".hidden.avif");
    expect(outputName("x.png", "image/unknown")).toBe("x.img");
  });
  it("knows the common formats", () => {
    expect(FORMAT_EXTENSIONS).toMatchObject({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" });
  });
});

describe("formatting helpers", () => {
  it("formats numbers, money and percentages", () => {
    expect(formatInt(1234567)).toBe("1,234,567");
    expect(formatMoney(1580.166)).toBe("$1,580.17");
    expect(formatMoney(-5)).toBe("-$5.00");
    expect(formatPercent(12.3456)).toBe("12.35%");
    expect(formatPercent(50, 0)).toBe("50%");
  });
  it("formats durations", () => {
    expect(formatMinutes(0)).toBe("0 sec");
    expect(formatMinutes(0.5)).toBe("30 sec");
    expect(formatMinutes(2.5)).toBe("2 min 30 sec");
    expect(formatMinutes(3)).toBe("3 min");
  });
  it("pluralizes", () => {
    expect(pluralize(1, "page")).toBe("1 page");
    expect(pluralize(2, "page")).toBe("2 pages");
    expect(pluralize(0, "page")).toBe("0 pages");
    expect(pluralize(1500, "person", "people")).toBe("1,500 people");
  });
  it("extracts error messages safely", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(new Error(""))).toBe("Something went wrong.");
    expect(errorMessage("string", "fallback")).toBe("fallback");
    expect(errorMessage(null)).toBe("Something went wrong.");
  });
});

describe("num", () => {
  it("parses numeric field strings and returns NaN for blanks and junk", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num("-3")).toBe(-3);
    expect(num("1e3")).toBe(1000);
    expect(num("")).toBeNaN();
    expect(num("   ")).toBeNaN();
    expect(num("abc")).toBeNaN();
  });
});
