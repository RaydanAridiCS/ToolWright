#!/usr/bin/env node
/**
 * Scaffold a new tool.
 *
 *   npm run new-tool my-tool-name -- --name "My Tool" --category developer --icon Wrench
 *   npm run new-tool my-tool-name -- --template custom --no-core
 *
 * Creates:
 *   packages/tools/src/tools/<slug>/meta.ts      what the site needs to know about the tool
 *   packages/tools/src/tools/<slug>/Tool.tsx     the UI (TransformTool by default)
 *   packages/core/src/<slug>.ts                  pure logic (skipped with --no-core)
 *   packages/core/tests/<slug>.test.ts           unit tests for the logic
 * then regenerates the registry.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./gen-registry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

const titleCase = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const camelCase = (slug) => slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const slug = positional[0];
if (!slug) fail("Usage: npm run new-tool <slug> [-- --name \"My Tool\" --category developer --icon Wrench --template transform|custom --no-core]");
if (!SLUG.test(slug)) fail(`"${slug}" is not a valid slug. Use lowercase letters, digits and single hyphens, e.g. "json-diff".`);

const categories = [...readFileSync(join(root, "packages/tools/src/categories.ts"), "utf8").matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
const category = String(flags.category ?? "developer");
if (!categories.includes(category)) fail(`Unknown category "${category}". Choose one of: ${categories.join(", ")}.`);

const template = String(flags.template ?? "transform");
if (!["transform", "custom"].includes(template)) fail('Template must be "transform" or "custom".');

const name = String(flags.name ?? titleCase(slug));
const icon = String(flags.icon ?? "Wrench");
if (!/^[A-Z][A-Za-z0-9]*$/.test(icon)) fail(`Icon "${icon}" should be a lucide-react icon name such as Wrench or FileText.`);
const withCore = flags.core !== false && !flags["no-core"];
const fn = camelCase(slug);
const words = slug.replace(/-/g, " ");
// Distinct starter keywords (the registry tests require at least three unique ones).
const keywords = [...new Set([name.toLowerCase(), words, `online ${words}`, `free ${words}`, `${words} tool`])].slice(0, 4);

const toolDir = join(root, "packages/tools/src/tools", slug);
const coreFile = join(root, "packages/core/src", `${slug}.ts`);
const testFile = join(root, "packages/core/tests", `${slug}.test.ts`);
if (existsSync(toolDir)) fail(`A tool called "${slug}" already exists.`);
if (withCore && existsSync(coreFile)) fail(`packages/core/src/${slug}.ts already exists. Use --no-core to skip creating it.`);

const meta = `import { ${icon} } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "${slug}",
  name: ${JSON.stringify(name)},
  // One line for cards and search results (20–110 characters).
  tagline: "Describe what ${name} does in one short sentence.",
  // 1–3 sentences for the page header and meta description. Mention that it runs in the browser.
  description:
    "Explain what ${name} does, who it helps and the options it offers. Everything runs in your browser, so nothing is uploaded.",
  category: "${category}",
  // Include synonyms people actually search for.
  keywords: ${JSON.stringify(keywords)},
  icon: ${icon},
  // howTo: ["Paste your input.", "Choose the options.", "Copy the result."],
  // faq: [{ question: "Is my data uploaded?", answer: "No. Everything is processed in your browser." }],
  // related: ["json-formatter"],
});
`;

const transformUi = withCore
  ? `"use client";

import { TransformTool } from "@toolwright/ui";
import { ${fn} } from "@toolwright/core/${slug}";

export default function Tool() {
  return (
    <TransformTool
      sample="Try me"
      options={[{ type: "toggle", key: "uppercase", label: "Uppercase", default: false }]}
      transform={(input, options) => ${fn}(input, { uppercase: Boolean(options.uppercase) })}
    />
  );
}
`
  : `"use client";

import { TransformTool } from "@toolwright/ui";

export default function Tool() {
  return <TransformTool sample="Try me" transform={(input) => input} />;
}
`;

const customUi = `"use client";

import { Field, Input, Panel, useShareableState } from "@toolwright/ui";
${withCore ? `import { ${fn} } from "@toolwright/core/${slug}";\n` : ""}
export default function Tool() {
  // State is mirrored into the URL hash so results can be shared. The hash never leaves the browser.
  const { state, setState } = useShareableState({ value: "" });

  return (
    <div className="flex flex-col gap-5">
      <Field label="Input">{(id) => <Input id={id} value={state.value} onChange={(e) => setState({ value: e.target.value })} />}</Field>
      <Panel title="Result">
        <p className="font-mono text-sm">${withCore ? `{state.value ? ${fn}(state.value) : "Type something above."}` : '{state.value || "Type something above."}'}</p>
      </Panel>
    </div>
  );
}
`;

const core = `/** Logic for the "${name}" tool. Keep this file free of React, the DOM and the network. */

export interface ${fn[0].toUpperCase() + fn.slice(1)}Options {
  uppercase?: boolean;
}

export function ${fn}(input: string, options: ${fn[0].toUpperCase() + fn.slice(1)}Options = {}): string {
  // TODO: replace with the real implementation.
  return options.uppercase ? input.toUpperCase() : input;
}
`;

const test = `import { describe, expect, it } from "vitest";
import { ${fn} } from "../src/${slug}";

describe("${fn}", () => {
  it("returns the input unchanged by default", () => {
    expect(${fn}("hello")).toBe("hello");
  });

  it("applies options", () => {
    expect(${fn}("hello", { uppercase: true })).toBe("HELLO");
  });

  it("handles empty input", () => {
    expect(${fn}("")).toBe("");
  });

  // Add the edge cases that matter for this tool: unicode, very long input, malformed input, etc.
});
`;

mkdirSync(toolDir, { recursive: true });
writeFileSync(join(toolDir, "meta.ts"), meta);
writeFileSync(join(toolDir, "Tool.tsx"), template === "custom" ? customUi : transformUi);
const created = [`packages/tools/src/tools/${slug}/meta.ts`, `packages/tools/src/tools/${slug}/Tool.tsx`];
if (withCore) {
  writeFileSync(coreFile, core);
  writeFileSync(testFile, test);
  created.push(`packages/core/src/${slug}.ts`, `packages/core/tests/${slug}.test.ts`);
}
generate();

console.log(`\n✔ Created the "${name}" tool:\n${created.map((f) => `   ${f}`).join("\n")}\n`);
console.log("Next steps:");
console.log(`  1. npm run dev, then open http://localhost:3000/tools/${slug}`);
console.log("  2. Fill in the TODOs: the tagline, description and keywords in meta.ts, and the logic in core.");
console.log("  3. npm run lint && npm run typecheck && npm test");
console.log("  4. Read docs/writing-a-tool.md for conventions, then open a pull request.\n");
