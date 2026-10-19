import { describe, expect, it } from "vitest";
import { formatSql, minifySql } from "../src/sql";
import {
  colorHarmony,
  contrastRatio,
  formatColor,
  generateScale,
  hslToRgb,
  mixColors,
  parseColor,
  readableTextColor,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToOklch,
  wcagContrast,
} from "../src/color";
import { CHARSETS, estimateStrength, generatePassphrase, generatePassword, randomInt, WORDLIST_SIZE } from "../src/password";
import { UNIT_CATEGORIES, convertTemperature, convertUnit, formatBytes, formatNumber, getCategory } from "../src/units";
import {
  compoundInterest,
  convertBase,
  decreaseByPercent,
  fromRoman,
  gcd,
  increaseByPercent,
  isPrime,
  lcm,
  loanPayment,
  numberToWords,
  percentChange,
  percentOf,
  primeFactors,
  splitBill,
  toRoman,
  whatPercent,
} from "../src/calc";

describe("SQL", () => {
  it("formats queries with upper-cased keywords", () => {
    expect(formatSql("select a,b from t where x=1")).toBe("SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1");
  });
  it("respects dialect and keyword case options", () => {
    expect(formatSql("SELECT 1", { keywordCase: "lower" })).toBe("select\n  1");
    expect(formatSql("select * from `t`", { language: "mysql" })).toContain("`t`");
  });
  it("minifies while protecting strings and quoted identifiers", () => {
    expect(minifySql("SELECT  a , 'x  y' -- note\n FROM /* c */ \"my  table\"\n WHERE b = 1;")).toBe("SELECT a,'x  y' FROM \"my  table\" WHERE b=1;");
  });
});

describe("color parsing and conversion", () => {
  it("parses hex, rgb, hsl and names", () => {
    expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor("#11223344")).toMatchObject({ r: 17, g: 34, b: 51, a: 0.267 });
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(10 20 30 / 50%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("hsl(120, 100%, 50%)")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor("RebeccaPurple")).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseColor("transparent")?.a).toBe(0);
  });
  it("rejects invalid colors", () => {
    for (const bad of ["", "#12", "#gggggg", "rgb(1,2)", "rgb(a,b,c)", "nope"]) expect(parseColor(bad)).toBeNull();
  });
  it("converts between models", () => {
    const red = { r: 255, g: 0, b: 0, a: 1 };
    expect(rgbToHex(red)).toBe("#ff0000");
    expect(rgbToHex({ ...red, a: 0.5 })).toBe("#ff000080");
    expect(rgbToHsl(red)).toEqual({ h: 0, s: 100, l: 50, a: 1 });
    expect(hslToRgb({ h: 240, s: 100, l: 50, a: 1 })).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0, a: 1 })).toEqual({ h: 120, s: 100, v: 100 });
    expect(rgbToCmyk({ r: 0, g: 0, b: 0, a: 1 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(rgbToCmyk(red)).toMatchObject({ c: 0, m: 100, y: 100, k: 0 });
  });
  it("round-trips hex → hsl → hex for many colors", () => {
    for (let i = 0; i < 200; i++) {
      const c = { r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 53) % 256, a: 1 };
      expect(rgbToHex(hslToRgb(rgbToHsl(c)))).toBe(rgbToHex(c));
    }
  });
  it("computes OKLCH for known colors", () => {
    expect(rgbToOklch({ r: 255, g: 255, b: 255, a: 1 }).l).toBeCloseTo(1, 3);
    const red = rgbToOklch({ r: 255, g: 0, b: 0, a: 1 });
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
  });
  it("formats all models", () => {
    expect(formatColor({ r: 255, g: 0, b: 0, a: 1 })).toMatchObject({
      hex: "#ff0000",
      rgb: "rgb(255, 0, 0)",
      hsl: "hsl(0, 100%, 50%)",
      cmyk: "cmyk(0%, 100%, 100%, 0%)",
    });
    expect(formatColor({ r: 255, g: 0, b: 0, a: 0.5 }).rgb).toBe("rgba(255, 0, 0, 0.5)");
  });
});

describe("color accessibility and palettes", () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  it("computes WCAG contrast", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    const grey = wcagContrast({ r: 119, g: 119, b: 119, a: 1 }, white); // #777 on white ≈ 4.48
    expect(grey.ratio).toBeCloseTo(4.48, 1);
    expect(grey.aaNormal).toBe(false);
    expect(grey.aaLarge).toBe(true);
    expect(wcagContrast(black, white)).toMatchObject({ aaNormal: true, aaaNormal: true });
  });
  it("picks readable text colors", () => {
    expect(readableTextColor(white)).toBe("#000000");
    expect(readableTextColor(black)).toBe("#ffffff");
    expect(readableTextColor({ r: 30, g: 40, b: 120, a: 1 })).toBe("#ffffff");
  });
  it("mixes colors", () => {
    expect(mixColors(black, white, 0.5)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(mixColors(black, white, 2)).toEqual(white);
  });
  it("generates scales and harmonies", () => {
    const scale = generateScale({ r: 79, g: 70, b: 229, a: 1 });
    expect(scale).toHaveLength(10);
    expect(scale[0]?.step).toBe(50);
    expect(scale.at(-1)?.step).toBe(900);
    expect(colorHarmony({ r: 255, g: 0, b: 0, a: 1 }, "complementary")).toEqual(["#ff0000", "#00ffff"]);
    expect(colorHarmony({ r: 255, g: 0, b: 0, a: 1 }, "triadic")).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
    expect(colorHarmony({ r: 255, g: 0, b: 0, a: 1 }, "monochromatic")).toHaveLength(5);
  });
});

describe("passwords", () => {
  // Deterministic "random" source that walks through byte values.
  const counter = () => {
    let n = 0;
    return (length: number) => Uint8Array.from({ length }, () => (n++ * 37) % 251);
  };
  it("honours length and always includes every selected class", () => {
    for (let i = 0; i < 50; i++) {
      const { password } = generatePassword({ length: 8, symbols: true });
      expect(password).toHaveLength(8);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });
  it("is deterministic with an injected random source", () => {
    expect(generatePassword({ length: 12 }, counter()).password).toBe(generatePassword({ length: 12 }, counter()).password);
  });
  it("excludes ambiguous and custom characters", () => {
    for (let i = 0; i < 30; i++) {
      const { password } = generatePassword({ length: 64, excludeAmbiguous: true, exclude: "xyz" });
      expect(password).not.toMatch(/[O0oIl1|xyz]/);
    }
  });
  it("reports entropy from the pool size", () => {
    const r = generatePassword({ length: 10, lower: true, upper: false, digits: false });
    expect(r.poolSize).toBe(26);
    expect(r.entropyBits).toBeCloseTo(10 * Math.log2(26), 5);
  });
  it("validates options", () => {
    expect(() => generatePassword({ lower: false, upper: false, digits: false })).toThrow(/at least one/);
    expect(() => generatePassword({ length: 2, symbols: true })).toThrow(/at least 4/);
    expect(() => generatePassword({ length: 99999 })).toThrow(RangeError);
  });
  it("covers every character class given enough samples (no obvious bias)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) for (const ch of generatePassword({ length: 32, symbols: true }).password) seen.add(ch);
    const all = CHARSETS.lower + CHARSETS.upper + CHARSETS.digits + CHARSETS.symbols;
    expect(seen.size).toBeGreaterThan(all.length - 8);
  });
  it("generates passphrases from the BIP39 list", () => {
    expect(WORDLIST_SIZE).toBe(2048);
    const r = generatePassphrase({ words: 5, separator: " " });
    expect(r.password.split(" ")).toHaveLength(5);
    expect(r.entropyBits).toBeCloseTo(55, 5);
    const withExtras = generatePassphrase({ words: 4, capitalize: true, includeNumber: true });
    expect(withExtras.password).toMatch(/[A-Z]/);
    expect(withExtras.password).toMatch(/\d/);
    expect(withExtras.entropyBits).toBeGreaterThan(44);
    expect(() => generatePassphrase({ words: 1 })).toThrow(RangeError);
  });
  it("randomInt is in range and rejects bad bounds", () => {
    for (let i = 0; i < 500; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
    expect(() => randomInt(0)).toThrow(RangeError);
  });
  it("estimates strength sensibly", () => {
    expect(estimateStrength("").label).toBe("very weak");
    expect(estimateStrength("password").warnings.join(" ")).toMatch(/common/);
    expect(estimateStrength("password").score).toBe(0);
    expect(estimateStrength("Tr0ub4dor&3xK9!qLw").score).toBeGreaterThanOrEqual(3);
    expect(estimateStrength("aaaaaaaaaaaa").warnings.join(" ")).toMatch(/Repeated/);
    expect(estimateStrength("correct-horse-battery-staple-9X!").label).toMatch(/strong/);
    expect(estimateStrength("abc").crackTime).toBe("instantly");
  });
});

describe("unit conversion", () => {
  it("converts lengths, mass, volume", () => {
    expect(convertUnit(1, "length", "mile", "kilometer")).toBeCloseTo(1.609344, 6);
    expect(convertUnit(12, "length", "inch", "foot")).toBeCloseTo(1, 10);
    expect(convertUnit(1, "mass", "pound", "gram")).toBeCloseTo(453.59237, 5);
    expect(convertUnit(1, "volume", "gallon", "liter")).toBeCloseTo(3.785411784, 8);
  });
  it("distinguishes decimal and binary data units", () => {
    expect(convertUnit(1, "data", "gigabyte", "megabyte")).toBe(1000);
    expect(convertUnit(1, "data", "gibibyte", "mebibyte")).toBe(1024);
    expect(convertUnit(8, "data", "bit", "byte")).toBe(1);
  });
  it("converts speed, time, pressure", () => {
    expect(convertUnit(100, "speed", "kilometer-per-hour", "mile-per-hour")).toBeCloseTo(62.1371, 3);
    expect(convertUnit(2, "time", "hour", "minute")).toBe(120);
    expect(convertUnit(1, "pressure", "atmosphere", "psi")).toBeCloseTo(14.6959, 3);
  });
  it("converts temperature", () => {
    expect(convertTemperature(100, "celsius", "fahrenheit")).toBeCloseTo(212, 10);
    expect(convertTemperature(32, "fahrenheit", "celsius")).toBeCloseTo(0, 10);
    expect(convertTemperature(0, "kelvin", "celsius")).toBeCloseTo(-273.15, 10);
    expect(convertTemperature(-40, "celsius", "fahrenheit")).toBeCloseTo(-40, 10);
    expect(convertTemperature(491.67, "rankine", "kelvin")).toBeCloseTo(273.15, 5);
  });
  it("round-trips every unit in every category", () => {
    for (const cat of UNIT_CATEGORIES) {
      for (const a of cat.units) {
        for (const b of cat.units) {
          const there = convertUnit(42, cat.id, a.id, b.id);
          expect(convertUnit(there, cat.id, b.id, a.id)).toBeCloseTo(42, 6);
        }
      }
    }
  });
  it("throws on unknown categories and units", () => {
    expect(() => getCategory("nope")).toThrow(RangeError);
    expect(() => convertUnit(1, "length", "meter", "parsec")).toThrow(RangeError);
  });
  it("formats numbers and byte sizes", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(1234.56789012)).toBe("1234.5679");
    expect(formatNumber(1e21)).toMatch(/e\+?21/);
    expect(formatNumber(0)).toBe("0");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.54 KB");
    expect(formatBytes(1536, { binary: true })).toBe("1.5 KiB");
    expect(formatBytes(5 * 1000 ** 3)).toBe("5 GB");
  });
});

describe("calculators", () => {
  it("does percentage math", () => {
    expect(percentOf(15, 200)).toBe(30);
    expect(whatPercent(30, 200)).toBe(15);
    expect(whatPercent(1, 0)).toBeNaN();
    expect(percentChange(50, 75)).toBe(50);
    expect(percentChange(80, 60)).toBe(-25);
    expect(increaseByPercent(200, 10)).toBeCloseTo(220);
    expect(decreaseByPercent(200, 10)).toBeCloseTo(180);
  });
  it("converts bases with BigInt precision", () => {
    expect(convertBase("255", 10, 16)).toBe("ff");
    expect(convertBase("0xFF", 16, 2)).toBe("11111111");
    expect(convertBase("-101", 2, 10)).toBe("-5");
    expect(convertBase("zz", 36, 10)).toBe("1295");
    expect(convertBase("0", 10, 2)).toBe("0");
    expect(convertBase("123456789012345678901234567890", 10, 16)).toBe("18ee90ff6c373e0ee4e3f0ad2");
    expect(convertBase("1_000", 10, 10)).toBe("1000");
  });
  it("rejects bad digits and bases", () => {
    expect(() => convertBase("12", 2, 10)).toThrow(/valid base-2 digit/);
    expect(() => convertBase("1", 1, 10)).toThrow(RangeError);
  });
  it("converts Roman numerals both ways", () => {
    expect(toRoman(1994)).toBe("MCMXCIV");
    expect(toRoman(3999)).toBe("MMMCMXCIX");
    expect(fromRoman("mcmxciv")).toBe(1994);
    for (let n = 1; n <= 3999; n += 37) expect(fromRoman(toRoman(n))).toBe(n);
    expect(() => toRoman(0)).toThrow(RangeError);
    expect(() => fromRoman("IIII")).toThrow(RangeError);
    expect(() => fromRoman("")).toThrow(RangeError);
  });
  it("calculates loan payments", () => {
    const loan = loanPayment(200_000, 6, 30);
    expect(loan.payment).toBeCloseTo(1199.1, 1);
    expect(loan.totalInterest).toBeCloseTo(231_676, -1);
    expect(loan.schedule).toHaveLength(360);
    expect(loan.schedule.at(-1)?.balance).toBe(0);
    expect(loanPayment(1200, 0, 1).payment).toBe(100);
    expect(() => loanPayment(0, 5, 1)).toThrow(RangeError);
  });
  it("calculates compound interest", () => {
    const r = compoundInterest({ principal: 1000, annualRatePercent: 5, years: 10, compoundsPerYear: 12 });
    expect(r.finalBalance).toBeCloseTo(1647.01, 2);
    expect(r.byYear).toHaveLength(10);
    const withContrib = compoundInterest({ principal: 0, annualRatePercent: 0, years: 2, compoundsPerYear: 12, contribution: 100 });
    expect(withContrib.finalBalance).toBe(2400);
    expect(withContrib.totalInterest).toBe(0);
  });
  it("splits bills", () => {
    expect(splitBill(100, 20, 4)).toEqual({ tip: 20, total: 120, perPerson: 30, tipPerPerson: 5 });
    expect(() => splitBill(10, 10, 0)).toThrow(RangeError);
  });
  it("does number theory", () => {
    expect(gcd(48, 18)).toBe(6);
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(0, 5)).toBe(0);
    expect(primeFactors(360)).toEqual([2, 2, 2, 3, 3, 5]);
    expect(primeFactors(97)).toEqual([97]);
    expect([2, 3, 4, 17, 18, 97].map(isPrime)).toEqual([true, true, false, true, false, true]);
    expect(() => primeFactors(1)).toThrow(RangeError);
  });
  it("spells numbers", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(13)).toBe("thirteen");
    expect(numberToWords(21)).toBe("twenty-one");
    expect(numberToWords(100)).toBe("one hundred");
    expect(numberToWords(1_234_567)).toBe("one million two hundred thirty-four thousand five hundred sixty-seven");
    expect(numberToWords(-5)).toBe("minus five");
    expect(numberToWords("1000000000000")).toBe("one trillion");
    expect(numberToWords(1_000_001n)).toBe("one million one");
  });
});
