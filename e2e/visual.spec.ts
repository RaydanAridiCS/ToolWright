import { expect, test } from "@playwright/test";

/**
 * Visual snapshots. Baselines are per-OS (fonts and anti-aliasing differ), so these are not part of CI:
 *   npm run e2e:visual -- --update-snapshots   # first run on your machine writes baselines
 *   npm run e2e:visual                         # later runs compare against them
 */
const PAGES = [
  ["home", "/"],
  ["catalogue", "/tools"],
  ["tool-json", "/tools/json-formatter"],
  ["tool-loan", "/tools/loan-calculator"],
  ["requests", "/requests"],
] as const;

for (const scheme of ["light", "dark"] as const) {
  for (const [name, path] of PAGES) {
    test(`@visual ${name} (${scheme})`, async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem("tw-theme", theme), scheme);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page).toHaveScreenshot(`${name}-${scheme}.png`, { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("[data-visual-mask]")] });
    });
  }
}
