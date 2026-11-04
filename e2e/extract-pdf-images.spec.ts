import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { appAlert, makeJpeg, makePng, trackRequests } from "./helpers";

const PDF_FIXTURES = join(__dirname, "..", "packages", "core", "tests", "fixtures", "pdf");

async function imagePdf(png: Buffer, jpeg: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const pngImage = await doc.embedPng(new Uint8Array(png));
  const jpgImage = await doc.embedJpg(new Uint8Array(jpeg));
  const page = doc.addPage([400, 400]);
  page.drawImage(pngImage, { x: 10, y: 200, width: 100, height: 75 });
  page.drawImage(jpgImage, { x: 10, y: 100, width: 100, height: 75 });
  return Buffer.from(await doc.save());
}

test.describe("Extract PDF Images", () => {
  test("extracts embedded JPEG and PNG, downloads a ZIP, and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/extract-pdf-images");
    const pdf = await imagePdf(await makePng(page, 100, 75), await makeJpeg(page, 100, 75));
    await page.locator('input[type="file"]').setInputFiles({ name: "mixed.pdf", mimeType: "application/pdf", buffer: pdf });
    await expect(page.getByText("1 page")).toBeVisible();

    await page.getByRole("button", { name: "Extract images" }).click();
    await expect(page.getByText("2 images found")).toBeVisible();

    const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download all as ZIP" }).click()]);
    const entries = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
    const names = Object.keys(entries).sort();
    expect(names).toHaveLength(2);
    const pngName = names.find((n) => n.endsWith(".png"))!;
    const jpgName = names.find((n) => n.endsWith(".jpg"))!;

    // PNG header.
    expect([...entries[pngName]!.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // JPEG header.
    expect([...entries[jpgName]!.subarray(0, 2)]).toEqual([0xff, 0xd8]);

    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("downloads a single image directly", async ({ page }) => {
    await page.goto("/tools/extract-pdf-images");
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(new Uint8Array(await makePng(page, 60, 40)));
    doc.addPage([100, 100]).drawImage(image, { x: 10, y: 10, width: 60, height: 40 });
    await page.locator('input[type="file"]').setInputFiles({ name: "shape.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
    await page.getByRole("button", { name: "Extract images" }).click();
    await expect(page.getByText("1 image found")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download image-001.png" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("image-001.png");
  });

  test("reports a PDF with no images", async ({ page }) => {
    await page.goto("/tools/extract-pdf-images");
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]).drawText("Just text.");
    await page.locator('input[type="file"]').setInputFiles({ name: "text.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
    await page.getByRole("button", { name: "Extract images" }).click();
    await expect(appAlert(page)).toContainText("no embedded images");
  });

  test("reports encrypted and corrupt PDFs with readable errors", async ({ page }) => {
    await page.goto("/tools/extract-pdf-images");
    await page.locator('input[type="file"]').setInputFiles(join(PDF_FIXTURES, "encrypted.pdf"));
    await expect(appAlert(page)).toContainText("password");

    await page.locator('input[type="file"]').setInputFiles(join(PDF_FIXTURES, "corrupt.pdf"));
    await expect(appAlert(page)).toContainText("could not be read");
  });
});
