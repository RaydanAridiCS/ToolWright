import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { trackRequests } from "./helpers";

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("Continue with… hand-off between PDF tools", () => {
  test("passes a merged PDF into the next tool without a download or upload", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([
      { name: "a.pdf", mimeType: "application/pdf", buffer: await pdf(2) },
      { name: "b.pdf", mimeType: "application/pdf", buffer: await pdf(3) },
    ]);
    await page.getByRole("button", { name: /^Merge 2 PDFs/ }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();

    await page.getByRole("button", { name: "Organize pages" }).click();
    await expect(page).toHaveURL(/\/tools\/pdf-organizer$/);
    await expect(page.getByText("merged.pdf")).toBeVisible();
    await expect(page.getByText("5 pages").first()).toBeVisible();

    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("the menu of more tools opens the chosen one with the file loaded", async ({ page }) => {
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await pdf(1) });
    await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    await page.getByLabel("More tools to continue with").selectOption("pdf-metadata-editor");
    await expect(page).toHaveURL(/\/tools\/pdf-metadata-editor$/);
    await expect(page.getByText("scan-rotated.pdf")).toBeVisible();
  });

  test("a reload drops the handed-off file", async ({ page }) => {
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await pdf(1) });
    await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page).toHaveURL(/\/tools\/compress-pdf$/);
    await expect(page.getByText("scan-rotated.pdf")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Drop a PDF here, or click to browse")).toBeVisible();
    await expect(page.getByText("scan-rotated.pdf")).toHaveCount(0);
  });
});
