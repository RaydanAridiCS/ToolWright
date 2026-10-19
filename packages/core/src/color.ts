/** Color parsing, conversion and accessibility helpers. */

export interface RGBA {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

export interface HSLA {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a: number;
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff", aqua: "#00ffff",
  magenta: "#ff00ff", fuchsia: "#ff00ff", silver: "#c0c0c0", gray: "#808080", grey: "#808080", maroon: "#800000", olive: "#808000", green: "#008000",
  purple: "#800080", teal: "#008080", navy: "#000080", orange: "#ffa500", pink: "#ffc0cb", brown: "#a52a2a", gold: "#ffd700", indigo: "#4b0082",
  violet: "#ee82ee", coral: "#ff7f50", salmon: "#fa8072", khaki: "#f0e68c", crimson: "#dc143c", turquoise: "#40e0d0", tomato: "#ff6347",
  rebeccapurple: "#663399", transparent: "#00000000",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parseColor(input: string): RGBA | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const named = NAMED[text];
  const value = named ?? text;

  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (hex) {
    let h = hex[1] as string;
    if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? Math.round((parseInt(h.slice(6, 8), 16) / 255) * 1000) / 1000 : 1,
    };
  }

  const fn = /^(rgba?|hsla?)\(\s*([^)]+)\)$/.exec(value);
  if (fn) {
    const kind = fn[1] as string;
    const args = (fn[2] as string).split(/[\s,/]+/).filter(Boolean);
    if (args.length < 3 || args.length > 4) return null;
    const num = (s: string, scale = 1) => (s.endsWith("%") ? (parseFloat(s) / 100) * scale : parseFloat(s));
    const alpha = args[3] === undefined ? 1 : clamp(num(args[3], 1), 0, 1);
    if (kind.startsWith("rgb")) {
      const [r, g, b] = args.slice(0, 3).map((s) => clamp(Math.round(num(s, 255)), 0, 255)) as [number, number, number];
      if ([r, g, b].some(Number.isNaN)) return null;
      return { r, g, b, a: alpha };
    }
    const h = ((parseFloat((args[0] as string).replace("deg", "")) % 360) + 360) % 360;
    const s = clamp(parseFloat(args[1] as string), 0, 100);
    const l = clamp(parseFloat(args[2] as string), 0, 100);
    if ([h, s, l].some(Number.isNaN)) return null;
    return { ...hslToRgb({ h, s, l, a: 1 }), a: alpha };
  }
  return null;
}

const to2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

export function rgbToHex({ r, g, b, a }: RGBA, withAlpha = false): string {
  const base = `#${to2(r)}${to2(g)}${to2(b)}`;
  return withAlpha || a < 1 ? `${base}${to2(a * 255)}` : base;
}

export function rgbToHsl({ r, g, b, a }: RGBA): HSLA {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100, a };
}

export function hslToRgb({ h, s, l, a }: HSLA): RGBA {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = ln - c / 2;
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255), a };
}

export function rgbToHsv({ r, g, b }: RGBA): { h: number; s: number; v: number } {
  const { h } = rgbToHsl({ r, g, b, a: 1 });
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return { h, s: max === 0 ? 0 : ((max - min) / max) * 100, v: max * 100 };
}

export function rgbToCmyk({ r, g, b }: RGBA): { c: number; m: number; y: number; k: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - rn - k) / (1 - k)) * 100,
    m: ((1 - gn - k) / (1 - k)) * 100,
    y: ((1 - bn - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** OKLCH (CSS Color 4). `l` is 0-1, `c` is chroma, `h` is degrees. */
export function rgbToOklch({ r, g, b }: RGBA): { l: number; c: number; h: number } {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h };
}

export function relativeLuminance({ r, g, b }: RGBA): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface WcagResult {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

export function wcagContrast(foreground: RGBA, background: RGBA): WcagResult {
  const ratio = contrastRatio(foreground, background);
  return { ratio, aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

/** Pick black or white text for the best contrast against a background. */
export function readableTextColor(background: RGBA): "#000000" | "#ffffff" {
  const black = contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, background);
  const white = contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, background);
  return black >= white ? "#000000" : "#ffffff";
}

export function mixColors(a: RGBA, b: RGBA, weight = 0.5): RGBA {
  const w = clamp(weight, 0, 1);
  return {
    r: Math.round(a.r * (1 - w) + b.r * w),
    g: Math.round(a.g * (1 - w) + b.g * w),
    b: Math.round(a.b * (1 - w) + b.b * w),
    a: a.a * (1 - w) + b.a * w,
  };
}

/** Ten-step scale from near-white to near-black through the base color (50…900 style). */
export function generateScale(base: RGBA, steps = 10): { step: number; hex: string }[] {
  const hsl = rgbToHsl(base);
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const l = 96 - t * 86; // 96 → 10
    return { step: i === 0 ? 50 : i * 100, hex: rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l, a: 1 })) };
  });
}

export type Harmony = "complementary" | "analogous" | "triadic" | "tetradic" | "split-complementary" | "monochromatic";

export function colorHarmony(base: RGBA, kind: Harmony): string[] {
  const hsl = rgbToHsl(base);
  const rotate = (deg: number, l = hsl.l) => rgbToHex(hslToRgb({ ...hsl, h: hsl.h + deg, l, a: 1 }));
  switch (kind) {
    case "complementary":
      return [rotate(0), rotate(180)];
    case "analogous":
      return [rotate(-30), rotate(0), rotate(30)];
    case "triadic":
      return [rotate(0), rotate(120), rotate(240)];
    case "tetradic":
      return [rotate(0), rotate(90), rotate(180), rotate(270)];
    case "split-complementary":
      return [rotate(0), rotate(150), rotate(210)];
    case "monochromatic":
      return [20, 35, 50, 65, 80].map((l) => rotate(0, l));
  }
}

const f = (n: number, digits = 0) => String(Number(n.toFixed(digits)));

export interface ColorFormats {
  hex: string;
  rgb: string;
  hsl: string;
  hsv: string;
  cmyk: string;
  oklch: string;
}

export function formatColor(color: RGBA): ColorFormats {
  const hsl = rgbToHsl(color);
  const hsv = rgbToHsv(color);
  const cmyk = rgbToCmyk(color);
  const ok = rgbToOklch(color);
  const alpha = color.a < 1 ? ` / ${f(color.a, 2)}` : "";
  return {
    hex: rgbToHex(color),
    rgb: color.a < 1 ? `rgba(${color.r}, ${color.g}, ${color.b}, ${f(color.a, 2)})` : `rgb(${color.r}, ${color.g}, ${color.b})`,
    hsl: color.a < 1 ? `hsla(${f(hsl.h)}, ${f(hsl.s)}%, ${f(hsl.l)}%, ${f(color.a, 2)})` : `hsl(${f(hsl.h)}, ${f(hsl.s)}%, ${f(hsl.l)}%)`,
    hsv: `hsv(${f(hsv.h)}, ${f(hsv.s)}%, ${f(hsv.v)}%)`,
    cmyk: `cmyk(${f(cmyk.c)}%, ${f(cmyk.m)}%, ${f(cmyk.y)}%, ${f(cmyk.k)}%)`,
    oklch: `oklch(${f(ok.l * 100, 1)}% ${f(ok.c, 3)} ${f(ok.h, 1)}${alpha})`,
  };
}
