import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { trackRequests } from "./helpers";

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

async function rotations(page: import("@playwright/test").Page): Promise<number[]> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  const doc = await PDFDocument.load(await readFile((await download.path())!));
  return doc.getPages().map((p) => p.getRotation().angle);
}

test.describe("Rotate PDF in a real browser", () => {
  test("turns single pages from the preview grid and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await pdf(3) });
    await expect(page.getByText("3 of 3 pages will turn")).toBeVisible();

    await page.getByRole("button", { name: "Turn page 2 counter-clockwise" }).click();
    await page.getByRole("button", { name: "Turn page 3 clockwise", exact: true }).click();
    await expect(page.getByText("2 of 3 pages will turn")).toBeVisible();
    await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
    expect(await rotations(page)).toEqual([90, 0, 180]);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("the quick controls still target a page range", async ({ page }) => {
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await pdf(4) });
    await page.getByRole("radio", { name: "180°" }).check({ force: true });
    await page.getByRole("radio", { name: "Selected pages" }).check({ force: true });
    await page.getByLabel("Pages to rotate").fill("2-3");
    await expect(page.getByText("2 of 4 pages will turn")).toBeVisible();
    await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
    expect(await rotations(page)).toEqual([0, 180, 180, 0]);
  });

  test("has no WCAG A/AA violations with the page grid shown", async ({ page }) => {
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await pdf(2) });
    await expect(page.getByText("2 of 2 pages will turn")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
});
