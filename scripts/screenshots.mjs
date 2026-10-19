#!/usr/bin/env node
/**
 * Takes the screenshots used in the README and design docs from a running production server.
 *
 *   npm run build && npm start            # in one terminal
 *   npm run screenshots                   # in another  (writes docs/images/*.png)
 *   node scripts/screenshots.mjs http://localhost:3000 some/other/dir
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = process.argv[3] ?? join(root, "docs", "images");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function shot(name, path, { scheme = "light", width = 1280, height = 900, full = false, prep } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 2 });
  // Pin the saved theme so the shot does not depend on the OS: "system" follows the emulated scheme, but we want it explicit.
  await context.addInitScript((theme) => localStorage.setItem("tw-theme", theme), scheme);
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  if (prep) await prep(page);
  await page.waitForTimeout(900); // let the hero animation settle
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  await context.close();
  console.log("  ✓", name);
}

console.log(`Screenshots from ${base} → ${out}`);
await shot("home-light", "/");
await shot("home-dark", "/", { scheme: "dark" });
await shot("home-full-light", "/", { full: true, height: 900 });
await shot("home-mobile", "/", { width: 390, height: 844 });
await shot("catalogue", "/tools", { height: 1000 });
await shot("tool-json", "/tools/json-formatter", {
  height: 1100,
  prep: async (p) => {
    await p.getByRole("button", { name: /sample/i }).click();
    await p.waitForTimeout(500);
  },
});
await shot("tool-merge-pdf-dark", "/tools/merge-pdf", { scheme: "dark", height: 1000 });
await shot("tool-loan", "/tools/loan-calculator", { height: 1100 });
await shot("tool-contrast", "/tools/contrast-checker", { height: 1000 });
await shot("requests", "/requests", { height: 1000 });
await shot("privacy", "/privacy", { height: 1000 });
await shot("tool-mobile", "/tools/password-generator", { width: 390, height: 844 });

await browser.close();
