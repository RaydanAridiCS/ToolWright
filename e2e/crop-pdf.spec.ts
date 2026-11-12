import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";
import { appAlert, trackRequests } from "./helpers";

/** A page with a black block in the middle and a wide white border, so blank borders can be detected. */
async function borderedPdf(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 600]);
    page.drawRectangle({ x: 100, y: 150, width: 200, height: 300, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

const MM = 72 / 25.4;

test.describe("Crop PDF in a real browser", () => {
  test("crops the margins, writes the new page boxes and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/crop-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await borderedPdf() });
    await expect(page.getByText("2 pages")).toBeVisible();

    await page.getByLabel("Top margin").fill("20");
    await page.getByLabel("Left margin").fill("10");
    await page.getByRole("button", { name: "Crop PDF", exact: true }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("scan-cropped.pdf");
    const doc = await PDFDocument.load(await readFile((await download.path())!));
    expect(doc.getPageCount()).toBe(2);
    for (const p of doc.getPages()) {
      const crop = p.getCropBox();
      expect(crop.x).toBeCloseTo(10 * MM, 1);
      expect(crop.width).toBeCloseTo(400 - 10 * MM, 1);
      expect(crop.height).toBeCloseTo(600 - 20 * MM, 1);
      expect(p.getMediaBox().width).toBeCloseTo(crop.width, 1);
    }
    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("detects the blank border from the page preview", async ({ page }) => {
    await page.goto("/tools/crop-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await borderedPdf(1) });
    await expect(page.getByRole("img", { name: /Preview of page 1/ }).locator("img")).toBeVisible();
    await page.getByRole("button", { name: "Detect blank borders" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Measured from page 1" })).toBeVisible();
    // 100 pt of white on the left and right (35 mm), less a little breathing room.
    const left = Number(await page.getByLabel("Left margin").inputValue());
    expect(left).toBeGreaterThan(25);
    expect(left).toBeLessThan(36);
    await page.getByRole("button", { name: "Crop PDF", exact: true }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
  });

  test("crops only the selected pages and can keep the page size", async ({ page }) => {
    await page.goto("/tools/crop-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await borderedPdf(3) });
    await page.getByLabel("Bottom margin").fill("30");
    await page.getByRole("radio", { name: "Selected pages" }).check({ force: true });
    await page.getByLabel("Pages to crop").fill("2");
    await page.getByRole("switch", { name: /make the page itself smaller/i }).uncheck();
    await page.getByRole("button", { name: "Crop PDF", exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    const doc = await PDFDocument.load(await readFile((await download.path())!));
    const [first, second, third] = doc.getPages();
    expect(first!.getCropBox().height).toBe(600);
    expect(second!.getCropBox().height).toBeCloseTo(600 - 30 * MM, 1);
    expect(second!.getMediaBox().height).toBe(600);
    expect(third!.getCropBox().height).toBe(600);
  });

  test("shows clear messages for no margins, too much and non-PDF files", async ({ page }) => {
    await page.goto("/tools/crop-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await borderedPdf(1) });
    await expect(page.getByRole("button", { name: "Crop PDF", exact: true })).toBeDisabled();
    await page.getByLabel("Left margin").fill("500");
    await expect(page.getByText(/leave almost nothing/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Crop PDF", exact: true })).toBeDisabled();

    await page.goto("/tools/crop-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
    await expect(appAlert(page)).toContainText("does not look like a PDF");
  });

  test("has no WCAG A/AA violations with a file loaded", async ({ page }) => {
    await page.goto("/tools/crop-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await borderedPdf(1) });
    await expect(page.getByRole("button", { name: "Detect blank borders" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
