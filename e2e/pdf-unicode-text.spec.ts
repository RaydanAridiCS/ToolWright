import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { appAlert, trackRequests } from "./helpers";

async function onePage(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 500]);
  return Buffer.from(await doc.save());
}

/** Names of the fonts embedded as Type0 (the kind used for Noto Sans), wherever they are stored in the file. */
async function embeddedFonts(path: string): Promise<string[]> {
  const doc = await PDFDocument.load(await readFile(path), { updateMetadata: false });
  const names: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Font") && object.get(PDFName.of("Subtype")) === PDFName.of("Type0")) {
      names.push(String(object.get(PDFName.of("BaseFont"))));
    }
  }
  return names;
}

async function download(page: Page): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  return (await file.path())!;
}

/** Opens a PDF in Redact PDF (which draws it with PDF.js) and returns the warnings PDF.js printed about its fonts. */
async function fontWarnings(page: Page, path: string): Promise<string[]> {
  const warnings: string[] = [];
  page.on("console", (m) => /font|loca|glyf|table/i.test(m.text()) && warnings.push(m.text()));
  await page.goto("/tools/redact-pdf");
  await page.locator('input[type="file"]').setInputFiles({ name: "result.pdf", mimeType: "application/pdf", buffer: await readFile(path) });
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
  await page.waitForTimeout(500);
  return warnings;
}

test.describe("Text in other alphabets on PDF pages, in a real browser", () => {
  test("a Cyrillic watermark fetches its font from this site and embeds it", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/pdf-watermark");
    await page.locator('input[type="file"]').setInputFiles({ name: "w.pdf", mimeType: "application/pdf", buffer: await onePage() });
    await page.getByLabel("Watermark text").fill("КОНФИДЕНЦИАЛЬНО");
    await page.getByRole("button", { name: "Add watermark" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();

    const path = await download(page);
    expect(await embeddedFonts(path)).toHaveLength(1);
    expect(tracker.all.some((r) => r.url().includes("/fonts/noto-sans/noto-sans-cyrillic-700-normal.woff"))).toBe(true);
    expect(tracker.external(baseURL!)).toEqual([]);
    // PDF.js can read the embedded font: it prints no warning about a broken font file.
    expect(await fontWarnings(page, path)).toEqual([]);
  });

  test("plain English text loads no font at all", async ({ page }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/pdf-watermark");
    await page.locator('input[type="file"]').setInputFiles({ name: "w.pdf", mimeType: "application/pdf", buffer: await onePage() });
    await page.getByRole("button", { name: "Add watermark" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    expect(await embeddedFonts(await download(page))).toEqual([]);
    expect(tracker.all.filter((r) => r.url().includes("/fonts/"))).toEqual([]);
  });

  test("a script no font covers is refused with the characters named", async ({ page }) => {
    await page.goto("/tools/pdf-watermark");
    await page.locator('input[type="file"]').setInputFiles({ name: "w.pdf", mimeType: "application/pdf", buffer: await onePage() });
    await page.getByLabel("Watermark text").fill("机密");
    await page.getByRole("button", { name: "Add watermark" }).click();
    await expect(appAlert(page)).toContainText("cannot be printed: 机 密");
  });

  test("Fill PDF Form types Greek text onto a flat page", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/fill-pdf-form");
    await page.locator('input[type="file"]').setInputFiles({ name: "flat.pdf", mimeType: "application/pdf", buffer: await onePage() });
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await page.getByLabel("Text 1", { exact: true }).fill("Ελένη Παπά");
    await page.getByRole("button", { name: "Create filled PDF" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    // Greek letters come from the Greek file and the space between the words from the Latin one.
    expect((await embeddedFonts(await download(page))).length).toBe(2);
    expect(tracker.external(baseURL!)).toEqual([]);
  });
});
