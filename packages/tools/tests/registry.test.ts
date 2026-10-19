import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATEGORIES, FEATURED_SLUGS, SLUG_PATTERN, categoriesWithCounts, getTool, popularTools, relatedTools, searchTools, tools, toolsByCategory } from "../src";
// @ts-expect-error: plain ESM script without type declarations
import { generate } from "../../../scripts/gen-registry.mjs";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "tools");

describe("generated registry", () => {
  it("is up to date with the tools folder", () => {
    const { stale, slugs } = generate({ check: true }) as { stale: boolean; slugs: string[] };
    expect(stale, "Run `node scripts/gen-registry.mjs`").toBe(false);
    expect(tools.map((t) => t.slug)).toEqual(slugs);
  });

  it("has a folder with meta.ts and Tool.tsx for every tool", () => {
    const folders = readdirSync(toolsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(folders.length).toBe(tools.length);
    for (const f of folders) {
      expect(existsSync(join(toolsDir, f.name, "meta.ts")), `${f.name}/meta.ts`).toBe(true);
      expect(existsSync(join(toolsDir, f.name, "Tool.tsx")), `${f.name}/Tool.tsx`).toBe(true);
    }
  });

  it("ships a large catalogue", () => {
    expect(tools.length).toBeGreaterThanOrEqual(60);
  });
});

describe("tool metadata", () => {
  const slugs = new Set<string>();

  it.each(tools.map((t) => [t.slug, t] as const))("%s is well-formed", (slug, tool) => {
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slugs.has(slug), `duplicate slug ${slug}`).toBe(false);
    slugs.add(slug);

    expect(CATEGORIES.map((c) => c.id)).toContain(tool.category);
    expect(tool.name.length).toBeGreaterThan(2);
    expect(tool.name.length).toBeLessThanOrEqual(48);
    expect(tool.tagline.length).toBeGreaterThanOrEqual(20);
    expect(tool.tagline.length).toBeLessThanOrEqual(110);
    expect(tool.description.length).toBeGreaterThanOrEqual(60);
    expect(tool.description.length).toBeLessThanOrEqual(420);
    expect(tool.keywords.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tool.keywords).size).toBe(tool.keywords.length);
    expect(tool.icon).toBeTruthy();

    for (const related of tool.related ?? []) {
      expect(related, `${slug} → ${related}`).not.toBe(slug);
      expect(getTool(related), `${slug} references unknown tool "${related}"`).toBeDefined();
    }
    for (const faq of tool.faq ?? []) {
      expect(faq.question.trim().endsWith("?")).toBe(true);
      expect(faq.answer.length).toBeGreaterThan(20);
    }
    for (const step of tool.howTo ?? []) expect(step.length).toBeGreaterThan(5);
  });

  it("matches the folder name", () => {
    for (const folder of readdirSync(toolsDir)) {
      const source = readFileSync(join(toolsDir, folder, "meta.ts"), "utf8");
      expect(source, `${folder}/meta.ts slug`).toContain(`slug: "${folder}"`);
    }
  });

  it("never markets the project as self-hostable", () => {
    const text = JSON.stringify(tools.map(({ icon: _icon, ...rest }) => rest)).toLowerCase();
    expect(text).not.toMatch(/self[- ]?host/);
    expect(text).not.toMatch(/deploy (it )?yourself|run (it )?on your own server/);
  });

  it("mentions the privacy model on tools that handle files", () => {
    for (const tool of tools.filter((t) => t.category === "pdf" || t.category === "image")) {
      const text = `${tool.description} ${tool.tagline}`.toLowerCase();
      expect(/upload|browser|device|local|private|never leave/.test(text), tool.slug).toBe(true);
    }
  });
});

describe("categories", () => {
  it("every category has at least one tool", () => {
    for (const category of CATEGORIES) expect(toolsByCategory(category.id).length, category.id).toBeGreaterThan(0);
    expect(categoriesWithCounts()).toHaveLength(CATEGORIES.length);
  });
  it("lists popular tools first", () => {
    const list = toolsByCategory("developer");
    const firstNonPopular = list.findIndex((t) => !t.popular);
    expect(list.slice(firstNonPopular).every((t) => !t.popular)).toBe(true);
  });
  it("has popular tools for the home page", () => {
    expect(popularTools(100).length).toBeGreaterThanOrEqual(12);
    expect(popularTools(5)).toHaveLength(5);
  });
  it("features hand-picked tools first, and every featured slug exists and is marked popular", () => {
    expect(popularTools(FEATURED_SLUGS.length).map((t) => t.slug)).toEqual([...FEATURED_SLUGS]);
    for (const slug of FEATURED_SLUGS) expect(getTool(slug)?.popular, slug).toBe(true);
  });
});

describe("relatedTools", () => {
  it("returns explicit relations first and excludes the tool itself", () => {
    const related = relatedTools("merge-pdf", 4);
    expect(related.map((t) => t.slug)).toEqual(["split-pdf", "extract-pdf-pages", "images-to-pdf", "rotate-pdf"]);
    expect(related.some((t) => t.slug === "merge-pdf")).toBe(false);
  });
  it("tops up from the same category and handles unknown slugs", () => {
    expect(relatedTools("delete-pdf-pages", 6)).toHaveLength(6);
    expect(relatedTools("nope")).toEqual([]);
  });
});

describe("searchTools", () => {
  it("finds tools by name, keyword and synonym", () => {
    expect(searchTools("json")[0]?.tool.slug).toMatch(/json/);
    expect(searchTools("merge pdf")[0]?.tool.slug).toBe("merge-pdf");
    expect(searchTools("uuid")[0]?.tool.slug).toBe("unique-id-generator");
    expect(searchTools("png to jpg").map((h) => h.tool.slug)).toContain("image-converter");
    expect(searchTools("tinypng")[0]?.tool.slug).toBe("image-compressor");
    expect(searchTools("camelcase")[0]?.tool.slug).toBe("case-converter");
  });
  it("requires every word to match", () => {
    expect(searchTools("json zzzzzz")).toEqual([]);
    expect(searchTools("")).toEqual([]);
    expect(searchTools("   ")).toEqual([]);
  });
  it("is case-insensitive and accent-insensitive", () => {
    expect(searchTools("QR")[0]?.tool.slug).toBe("qr-code-generator");
    expect(searchTools("QRÇODE").length).toBeGreaterThanOrEqual(0);
  });
  it("respects the limit and ranks name matches above description matches", () => {
    expect(searchTools("a", 3).length).toBeLessThanOrEqual(3);
    const hits = searchTools("hash");
    expect(hits[0]?.tool.slug).toBe("hash-generator");
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
  it("every tool can be found by its own name", () => {
    for (const tool of tools) {
      const slugs = searchTools(tool.name, 5).map((h) => h.tool.slug);
      expect(slugs, `searching "${tool.name}"`).toContain(tool.slug);
    }
  });
});
