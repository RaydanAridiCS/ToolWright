import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { trackRequests } from "./helpers";

const A4 = { width: 595.28, height: 841.89 };
const LETTER = { width: 612, height: 792 };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function file(name: string, pages: number, size = A4) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let k = 0; k < pages; k++) doc.addPage([size.width, size.height]).drawText(`Page ${k + 1}`, { x: 60, y: size.height - 120, size: 36, font });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

async function download(page: Page) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return { name: file.suggestedFilename(), doc: await PDFDocument.load(await readFile((await file.path())!)) };
}

const sizes = (doc: PDFDocument) => doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);

test.describe("N-up PDF", () => {
  test("previews each sheet and makes a 4-up PDF without any request elsewhere", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/pdf-n-up");
    await page.locator('input[type="file"]').setInputFiles(await file("slides.pdf", 6));
    await expect(page.getByRole("img", { name: "Sheet 1: pages 1, 2, 3, 4." })).toBeVisible();
    await expect(page.getByText("6 pages fit on 2 sheets, 4 fewer to print.")).toBeVisible();
    await page.getByRole("button", { name: "Next sheet" }).click();
    await expect(page.getByRole("img", { name: "Sheet 2: pages 5, 6." })).toBeVisible();

    await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
    await expect(page.getByText("6 pages fit on 3 sheets, 3 fewer to print.")).toBeVisible();
    await page.getByLabel("Paper size").selectOption("letter");
    await page.getByRole("button", { name: "Make 2-up PDF" }).click();
    const out = await download(page);
    expect(out.name).toBe("slides-2-up.pdf");
    // Two portrait pages side by side on landscape Letter.
    expect(sizes(out.doc)).toEqual([
      [792, 612],
      [792, 612],
      [792, 612],
    ]);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("repeats a page to fill the sheet", async ({ page }) => {
    await page.goto("/tools/pdf-n-up");
    await page.locator('input[type="file"]').setInputFiles(await file("card.pdf", 1));
    await page.getByRole("radio", { name: "8", exact: true }).check({ force: true });
    await page.getByRole("switch", { name: "Repeat each page to fill the sheet" }).check({ force: true });
    await expect(page.getByRole("img", { name: "Sheet 1: pages 1, 1, 1, 1, 1, 1, 1, 1." })).toBeVisible();
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/pdf-n-up");
    await page.locator('input[type="file"]').setInputFiles(await file("slides.pdf", 6));
    await expect(page.getByRole("img", { name: /^Sheet 1:/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe("PDF Booklet Maker", () => {
  test("shows the folding order and makes the booklet", async ({ page }) => {
    await page.goto("/tools/pdf-booklet");
    await page.locator('input[type="file"]').setInputFiles(await file("zine.pdf", 6));
    await page.getByLabel("Paper you print on").selectOption("a4");
    await expect(page.getByText("6 pages on 2 sheets of paper, with 2 blank pages added.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Sheet 1, front: page 1." })).toBeVisible();
    await expect(page.getByRole("img", { name: "Sheet 1, back: page 2." })).toBeVisible();
    await page.getByLabel("Blank pages go").selectOption("before-back");
    await expect(page.getByRole("img", { name: "Sheet 1, front: pages 6, 1." })).toBeVisible();
    await page.getByRole("radio", { name: /^Right/ }).check({ force: true });
    await expect(page.getByRole("img", { name: "Sheet 1, front: pages 1, 6." })).toBeVisible();
    await page.getByRole("button", { name: "Make booklet" }).click();
    const out = await download(page);
    expect(out.name).toBe("zine-booklet.pdf");
    expect(sizes(out.doc)).toEqual(Array(4).fill([842, 595]));
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/pdf-booklet");
    await page.locator('input[type="file"]').setInputFiles(await file("zine.pdf", 8));
    await expect(page.getByRole("img", { name: /^Sheet 1, front/ })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});

test.describe("Resize PDF Pages", () => {
  test("turns Letter pages into A4, only on the pages chosen", async ({ page }) => {
    await page.goto("/tools/resize-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("letter.pdf", 3, LETTER));
    await expect(page.getByText(/^Now 216 × 279 mm/)).toBeVisible();
    await expect(page.getByLabel("New page size")).toHaveValue("a4");
    await expect(page.getByText(/^New size: 210 × 297 mm/)).toBeVisible();
    await page.getByRole("radio", { name: "Selected pages" }).check({ force: true });
    await page.getByLabel("Pages to resize").fill("1, 3");
    await page.getByRole("button", { name: "Resize PDF" }).click();
    const out = await download(page);
    expect(out.name).toBe("letter-a4.pdf");
    expect(sizes(out.doc)).toEqual([
      [595, 842],
      [612, 792],
      [595, 842],
    ]);
  });

  test("starts from Letter for an A4 file and takes a custom size", async ({ page }) => {
    await page.goto("/tools/resize-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("a4.pdf", 1));
    await expect(page.getByLabel("New page size")).toHaveValue("letter");
    await page.getByLabel("New page size").selectOption("custom");
    await page.getByLabel("Width").fill("100");
    await page.getByLabel("Height").fill("150");
    await page.getByRole("button", { name: "Resize PDF" }).click();
    const out = await download(page);
    expect(sizes(out.doc)).toEqual([[283, 425]]);
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/resize-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("letter.pdf", 2, LETTER));
    await expect(page.getByText(/^New size:/)).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});
