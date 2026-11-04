import { expect, test } from "@playwright/test";

test.describe("Data Matrix Generator", () => {
  test("generates and downloads an SVG barcode", async ({ page }) => {
    await page.goto("/tools/data-matrix-generator");
    await expect(page.getByRole("heading", { name: "Data Matrix Generator", exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "Text to encode", exact: true }).fill("TOOLWRIGHT-12345");
    await page.getByRole("button", { name: "Generate" }).click();

    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "SVG" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("data-matrix.svg");
  });

  test("warns about empty input", async ({ page }) => {
    await page.goto("/tools/data-matrix-generator");
    await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();
  });
});
