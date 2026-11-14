import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { trackRequests } from "./helpers";

async function pdf(pages: number, title?: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

const files = async () => [
  { name: "one.pdf", mimeType: "application/pdf", buffer: await pdf(1, "Secret one") },
  { name: "two.pdf", mimeType: "application/pdf", buffer: await pdf(2, "Secret two") },
  { name: "three.pdf", mimeType: "application/pdf", buffer: await pdf(3, "Secret three") },
];

async function zipEntries(page: import("@playwright/test").Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  return unzipSync(new Uint8Array(await readFile((await download.path())!)));
}

test.describe("Batch PDF processing", () => {
  test("rotates three PDFs at once into one ZIP and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles(await files());
    await page.getByRole("button", { name: "Rotate 3 PDFs" }).click();
    await expect(page.getByText(/rotated-pdfs.zip · .* · 3 PDFs/)).toBeVisible();
    const entries = await zipEntries(page);
    expect(Object.keys(entries).sort()).toEqual(["one-rotated.pdf", "three-rotated.pdf", "two-rotated.pdf"]);
    const three = await PDFDocument.load(entries["three-rotated.pdf"]!);
    expect(three.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90, 90]);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("numbers every file and keeps adding files to the batch", async ({ page }) => {
    await page.goto("/tools/pdf-page-numbers");
    const [a, b, c] = await files();
    await page.locator('input[type="file"]').setInputFiles([a!, b!]);
    await expect(page.getByRole("button", { name: "Add page numbers to 2 PDFs" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles([c!]);
    await page.getByRole("button", { name: "Add page numbers to 3 PDFs" }).click();
    expect(Object.keys(await zipEntries(page))).toHaveLength(3);
  });

  test("removes the metadata from every file", async ({ page }) => {
    await page.goto("/tools/pdf-metadata-editor");
    await page.locator('input[type="file"]').setInputFiles(await files());
    await page.getByRole("button", { name: "Remove all metadata from 3 PDFs" }).click();
    for (const data of Object.values(await zipEntries(page))) expect((await PDFDocument.load(data)).getTitle()).toBeUndefined();
  });

  test("a single file still downloads as a PDF, and a bad file is named", async ({ page }) => {
    await page.goto("/tools/pdf-watermark");
    await page.locator('input[type="file"]').setInputFiles([
      { name: "good.pdf", mimeType: "application/pdf", buffer: await pdf(1) },
      { name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") },
    ]);
    await expect(page.getByText("bad.pdf does not look like a PDF file.")).toBeVisible();
    await page.getByRole("button", { name: "Add watermark", exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("good-watermarked.pdf");
  });
});
