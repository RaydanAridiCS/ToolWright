// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const light = block(":root");
const dark = block(".dark");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fraction` of `fg` laid over `bg`, as a solid color (how a translucent border or text actually renders). */
function mix(fg: string, bg: string, fraction: number): string {
  const channel = (i: number) => Math.round(parseInt(fg.slice(i, i + 2), 16) * fraction + parseInt(bg.slice(i, i + 2), 16) * (1 - fraction));
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`;
}

const TEXT_PAIRS: [fg: string, bg: string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "muted"],
  ["card-foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["marker-foreground", "marker"],
  ["success", "background"],
  ["success", "card"],
  ["warning", "background"],
  ["warning", "card"],
  ["danger", "background"],
  ["danger", "card"],
];

describe.each([
  ["light paper", light],
  ["dark ink", dark],
] as const)("design tokens: %s", (_name, t) => {
  it("defines every token", () => {
    for (const key of ["background", "foreground", "card", "muted", "muted-foreground", "border", "primary", "primary-foreground", "secondary", "marker", "marker-foreground", "ring", "success", "warning", "danger", "shadow-ink"]) {
      expect(t[key], `--${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT_PAIRS)("%s on %s meets WCAG AA for text (4.5:1)", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!), `${fg} ${t[fg]} on ${bg} ${t[bg]}`).toBeGreaterThanOrEqual(4.5);
  });

  it("ink text on the highlighter marker is readable (the marker is used behind text in both themes)", () => {
    expect(contrast(t["marker-foreground"]!, t["marker"]!)).toBeGreaterThanOrEqual(7);
  });

  it("form control borders (ink at 55%) are visible against the sheet: WCAG 1.4.11 needs 3:1", () => {
    const border = mix(t["foreground"]!, t["card"]!, 0.55);
    expect(contrast(border, t["card"]!)).toBeGreaterThanOrEqual(3);
  });

  it("the focus ring is visible against the page and the sheet (3:1)", () => {
    expect(contrast(t["ring"]!, t["background"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(t["ring"]!, t["card"]!)).toBeGreaterThanOrEqual(3);
  });

  it("the muted surface stays distinguishable from the page (hover and well states)", () => {
    expect(t["muted"]).not.toBe(t["background"]);
    expect(t["card"]).not.toBe(t["background"]);
  });
});

describe("design tokens: shared decisions", () => {
  it("the marker is the same highlighter lime in both themes", () => {
    expect(light["marker"]).toBe(dark["marker"]);
    expect(light["marker-foreground"]).toBe(dark["marker-foreground"]);
  });

  it("light paper is warm and dark ink is warm too (no cold blue-grays)", () => {
    for (const hex of [light["background"]!, light["card"]!, dark["background"]!, dark["card"]!]) {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      expect(r, hex).toBeGreaterThanOrEqual(b);
    }
  });

  it("radius is remapped to sharp corners and elevation to hard shadows", () => {
    expect(css).toMatch(/--radius-xl:\s*4px/);
    expect(css).toMatch(/--radius-3xl:\s*6px/);
    expect(css).toMatch(/--shadow-md:\s*3px 3px 0 0 var\(--shadow-ink\)/);
    expect(css).toMatch(/--shadow-sm:\s*none/);
  });
});
