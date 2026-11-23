#!/usr/bin/env node
/**
 * Renders the brand images from the HTML pages in social-assets/src at their exact canvas size.
 *
 *   node scripts/render-brand-assets.mjs
 *
 * Writes docs/images/social-preview.png (GitHub social preview, 1280x640) and, in social-assets/profile/,
 * avatar-1080.png and youtube-banner-2560x1440.png. Fonts load from Google Fonts, so this needs a connection;
 * the script stops if a font did not load instead of saving a picture in a fallback font.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "social-assets", "src");
const profile = join(root, "social-assets", "profile");
mkdirSync(profile, { recursive: true });

const assets = [
  { page: "social-preview.html", width: 1280, height: 640, out: join(root, "docs", "images", "social-preview.png"), fonts: true },
  { page: "avatar.html", width: 1080, height: 1080, out: join(profile, "avatar-1080.png"), fonts: false },
  { page: "youtube-banner.html", width: 2560, height: 1440, out: join(profile, "youtube-banner-2560x1440.png"), fonts: true },
];

const browser = await chromium.launch();
try {
  for (const a of assets) {
    const page = await browser.newPage({ viewport: { width: a.width, height: a.height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(src, a.page)).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (a.fonts) {
      const missing = await page.evaluate(() =>
        ['800 40px "Bricolage Grotesque"', '400 20px "Instrument Sans"', '500 20px "Geist Mono"'].filter(
          (f) => !document.fonts.check(f) || ![...document.fonts].some((ff) => f.includes(ff.family) && ff.status === "loaded"),
        ),
      );
      if (missing.length) throw new Error(`${a.page}: fonts not loaded: ${missing.join(", ")}`);
    }
    await page.screenshot({ path: a.out, clip: { x: 0, y: 0, width: a.width, height: a.height } });
    await page.close();
    console.log(`  ✓ ${a.out.slice(root.length + 1)} (${a.width}x${a.height})`);
  }
} finally {
  await browser.close();
}
