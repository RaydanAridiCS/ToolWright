import { expect, test } from "@playwright/test";

test.describe("PDF417 Generator", () => {
  test("generates and downloads an SVG barcode", async ({ page }) => {
    await page.goto("/tools/pdf417-generator");
    await expect(page.getByRole("heading", { name: "PDF417 Generator", exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "Text to encode", exact: true }).fill("SHIP-9876543210");
    await page.getByRole("button", { name: "Generate" }).click();

    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "SVG" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("pdf417.svg");
  });

  test("warns about empty input", async ({ page }) => {
    await page.goto("/tools/pdf417-generator");
    await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();
  });
});
