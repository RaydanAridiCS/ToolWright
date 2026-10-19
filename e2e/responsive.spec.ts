import { expect, test } from "@playwright/test";

// Runs in the "mobile" project (Pixel 7, 412px wide) and the desktop project.
const PAGES = ["/", "/tools", "/requests", "/privacy", "/tools/json-formatter", "/tools/text-diff", "/tools/qr-code-generator", "/tools/merge-pdf", "/tools/loan-calculator", "/tools/regex-tester", "/tools/image-compressor", "/tools/palette-generator"];

test.describe("responsive layout", () => {
  for (const path of PAGES) {
    test(`${path} has no horizontal page scroll`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.locator("main").first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(1);
    });
  }

  test("mobile menu opens and navigates", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: /Tools/ }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("tool controls are large enough to tap", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/tools/case-converter");
    const box = await page.getByLabel("Convert to").boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });
});
