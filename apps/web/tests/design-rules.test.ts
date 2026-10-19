// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The design rules from docs/design-language.md, enforced. If one of these fails you have probably
 * reintroduced something that makes the site look like every other generated landing page.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIRS = ["apps/web/src", "packages/ui/src", "packages/tools/src"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css|svg)$/.test(name) && !name.includes(".generated.") ? [full] : [];
  });
}

/** Source without comments, so a comment that says "no gradients" does not trip the scan. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const FILES = DIRS.flatMap((d) => walk(join(ROOT, d))).map((file) => ({ file, rel: relative(ROOT, file).replaceAll("\\", "/"), src: code(file) }));

function offenders(pattern: RegExp): string[] {
  return FILES.flatMap(({ rel, src }) => (pattern.test(src) ? [rel] : []));
}

describe("design rules: no AI-slop", () => {
  it("scans a meaningful number of files", () => {
    expect(FILES.length).toBeGreaterThan(150);
  });

  it("uses no gradients anywhere (backgrounds, text, borders, shimmer)", () => {
    expect(offenders(/gradient/i)).toEqual([]);
  });

  it("uses no glass or glow effects", () => {
    expect(offenders(/backdrop-|\bblur(-\w+)?\b|filter:\s*blur|drop-shadow|glow/i)).toEqual([]);
  });

  it("has no gradient-text headlines", () => {
    expect(offenders(/bg-clip-text|text-transparent/)).toEqual([]);
  });

  it("keeps corners sharp: no oversized rounding", () => {
    expect(offenders(/rounded-(2xl|3xl)\b/)).toEqual([]);
  });

  it("has no pill chips: rounded-full is only for true circles (no padded pills)", () => {
    expect(offenders(/rounded-full[^"'`}]*\bp[xy]-/)).toEqual([]);
    expect(offenders(/\bp[xy]-[\d.]+[^"'`}]*rounded-full/)).toEqual([]);
  });

  it("uses no purple, indigo, violet, fuchsia, pink or orange Tailwind colors", () => {
    expect(offenders(/\b(?:bg|text|border|from|to|via|ring|fill|stroke|accent|outline|shadow|decoration)-(?:purple|indigo|violet|fuchsia|pink|orange|amber)(?:-\d+)?\b/)).toEqual([]);
  });

  it("uses no purple/blue-violet or orange hex colors in source", () => {
    const bad: string[] = [];
    for (const { rel, src } of FILES) {
      for (const [hex] of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) continue;
        const sat = (max - min) / max;
        let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
        h = (h * 60 + 360) % 360;
        const purple = h >= 245 && h <= 315 && sat > 0.2 && max > 60;
        const orange = h >= 15 && h <= 45 && sat > 0.5 && max > 150;
        if (purple || orange) bad.push(`${rel}: ${hex} (hue ${Math.round(h)}°)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("avoids marketing filler in the interface copy", () => {
    expect(offenders(/\b(supercharge|unlock the power|seamless(ly)?|revolutionary|game-?chang\w*|cutting-edge|next-level|effortless(ly)?|blazing[- ]fast)\b/i)).toEqual([]);
  });
});

describe("design rules: structure", () => {
  const home = FILES.find((f) => f.rel === "apps/web/src/app/page.tsx")!.src;

  it("the home hero is a headline, a promise, one action and the live bench, with no eyebrow chip", () => {
    const hero = home.slice(home.indexOf("<section"), home.indexOf("</section>"));
    expect(hero).toContain("<h1");
    expect(hero).toContain("<HeroBench");
    expect(hero).not.toMatch(/rounded-full|<Badge/);
    // Nothing sits above the headline except layout containers.
    const beforeH1 = hero.slice(0, hero.indexOf("<h1"));
    expect(beforeH1).not.toMatch(/<p\b/);
  });

  it("the home page carries the signature pieces: ledger, ruler, proof log", () => {
    expect(home).toContain("<Ledger");
    expect(home).toContain("<Ruler");
    expect(home).toContain("<ProofLog");
  });

  it("tool pages show the plate with the live network ledger instead of status chips", () => {
    const page = FILES.find((f) => f.rel === "apps/web/src/app/tools/[slug]/page.tsx")!.src;
    expect(page).toContain("<Plate");
    expect(page).toContain("<NetworkLedger");
    expect(page).not.toContain("<Badge");
  });

  it("shared UI never reintroduces the shadow-sm card look or soft shadows", () => {
    // Component files only: globals.css legitimately *defines* the flat --shadow-sm token.
    const components = FILES.filter((f) => f.rel.endsWith(".tsx") && /\bshadow-(sm|inner)\b/.test(f.src)).map((f) => f.rel);
    expect(components).toEqual([]);
  });
});
