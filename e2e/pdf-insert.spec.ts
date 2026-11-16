import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { trackRequests } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** File `id`'s page k is (id*100 + k) points wide, so the order of the result can be read back. */
async function file(name: string, id: number, pages: number) {
  const doc = await PDFDocument.create();
  for (let k = 0; k < pages; k++) doc.addPage([id * 100 + k, 400]);
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

async function download(page: Page) {
  const [got] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return { name: got.suggestedFilename(), doc: await PDFDocument.load(await readFile((await got.path())!)) };
}

const widths = (doc: PDFDocument) => doc.getPages().map((p) => Math.round(p.getWidth()));

test.describe("Insert PDF Pages", () => {
  test("inserts blank pages where clicked, without any request elsewhere", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/insert-pdf-pages");
    await page.locator('input[type="file"]').first().setInputFiles(await file("report.pdf", 3, 3));
    // The end is chosen to start with.
    await expect(page.getByText("Inserts 1 blank page at 1 spot. The new PDF has 4 pages.")).toBeVisible();
    await page.getByRole("button", { name: "Insert after page 1", exact: true }).click();
    await page.getByRole("button", { name: "Blank page inserted after page 3, at the end. Click to take away" }).click();
    await page.getByRole("button", { name: "At the start" }).click();
    await expect(page.getByText("Inserts 2 blank pages at 2 spots. The new PDF has 5 pages.")).toBeVisible();
    await page.getByRole("button", { name: "Insert pages" }).click();
    const out = await download(page);
    expect(out.name).toBe("report-inserted.pdf");
    // Blanks match the page next to them: the first page at the start, page 1 after page 1.
    expect(widths(out.doc)).toEqual([300, 300, 300, 301, 302]);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("inserts chosen pages of another PDF after every 2 pages", async ({ page }) => {
    await page.goto("/tools/insert-pdf-pages");
    await page.locator('input[type="file"]').first().setInputFiles(await file("doc.pdf", 3, 4));
    await page.getByRole("radio", { name: "Pages from another PDF" }).check({ force: true });
    await page.locator('input[type="file"]').first().setInputFiles(await file("extra.pdf", 9, 3));
    await page.getByLabel("Pages to insert").fill("3");
    await page.getByRole("radio", { name: "After every N pages" }).check({ force: true });
    await page.getByLabel("Insert after every").fill("2");
    await expect(page.getByText("Inserts 2 pages at 2 spots. The new PDF has 6 pages.")).toBeVisible();
    await page.getByRole("button", { name: "Insert pages" }).click();
    expect(widths((await download(page)).doc)).toEqual([300, 301, 902, 302, 303, 902]);
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/insert-pdf-pages");
    await page.locator('input[type="file"]').first().setInputFiles(await file("report.pdf", 3, 3));
    await expect(page.getByText(/^Inserts 1 blank page/)).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe("Alternate & Mix PDF", () => {
  test("mixes fronts with reversed backs and previews the order", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/alternate-mix-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("fronts.pdf", 1, 3), await file("backs.pdf", 2, 3)]);
    await expect(page.getByText("The new PDF has 6 pages, in this order:")).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Page 2: file B page 3" })).toBeVisible();
    await page.getByRole("button", { name: "Mix pages" }).click();
    const out = await download(page);
    expect(out.name).toBe("fronts-mixed.pdf");
    expect(widths(out.doc)).toEqual([100, 202, 101, 201, 102, 200]);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("warns when the page counts differ, and mixes the halves of one file", async ({ page }) => {
    await page.goto("/tools/alternate-mix-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("a.pdf", 1, 3), await file("b.pdf", 2, 2)]);
    await expect(page.getByText(/have 3 and 2 pages/)).toBeVisible();

    await page.getByRole("radio", { name: "One file: fronts, then backs" }).check({ force: true });
    await page.locator('input[type="file"]').setInputFiles(await file("scan.pdf", 1, 4));
    await expect(page.getByText(/pages 1 to 2 are the fronts/)).toBeVisible();
    await page.getByRole("button", { name: "Mix pages" }).click();
    expect(widths((await download(page)).doc)).toEqual([100, 103, 101, 102]);
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/alternate-mix-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("fronts.pdf", 1, 2), await file("backs.pdf", 2, 2)]);
    await expect(page.getByText(/^The new PDF has 4 pages/)).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});
