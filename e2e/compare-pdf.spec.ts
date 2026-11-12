import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { appAlert, trackRequests } from "./helpers";

/** A PDF with one page per entry; each entry is the lines of text on that page. */
async function textPdf(pages: string[][]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([400, 500]);
    lines.forEach((line, i) => page.drawText(line, { x: 40, y: 440 - i * 28, size: 16, font }));
  }
  return Buffer.from(await doc.save());
}

async function scanLikePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 500]).drawRectangle({ x: 50, y: 50, width: 300, height: 400, color: rgb(0.2, 0.2, 0.2) });
  return Buffer.from(await doc.save());
}

const OLD = [["Intro line", "Price is 10 dollars"], ["Old clause"]];
const NEW = [["Intro line", "Price is 12 dollars"], ["New clause", "Extra clause"]];

async function load(page: Page, a: Buffer, b: Buffer) {
  await page.goto("/tools/compare-pdf");
  // Once A is chosen its drop box is replaced by a file card, so B's input is the first one left.
  await page.locator('input[type="file"]').first().setInputFiles({ name: "old.pdf", mimeType: "application/pdf", buffer: a });
  await expect(page.getByText("old.pdf")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "new.pdf", mimeType: "application/pdf", buffer: b });
  await expect(page.getByText("new.pdf")).toBeVisible();
}

test.describe("Compare PDFs in a real browser", () => {
  test("lists the changed lines, marks the edited words and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await load(page, await textPdf(OLD), await textPdf(NEW));
    await expect(page.getByText("Changed pages in A: 1, 2. In B: 1, 2.")).toBeVisible();
    // The edited number is struck through on the old side and emphasised on the new side.
    await expect(page.locator("span.line-through", { hasText: "10" })).toBeVisible();
    await expect(page.locator("span.font-semibold", { hasText: "12" })).toBeVisible();
    await expect(page.getByText("Extra clause")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy list of changes" })).toBeVisible();
    // The unchanged first line is hidden unless it is context, and the identical message is not shown.
    await expect(page.getByText("The text of the two files is identical")).toHaveCount(0);
    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("says when the text is identical and when ignoring case hides a difference", async ({ page }) => {
    await load(page, await textPdf([["Hello World"]]), await textPdf([["hello world"]]));
    await expect(page.getByText(/Changed pages in A: 1/)).toBeVisible();
    await page.getByRole("switch", { name: "Ignore case" }).check();
    await expect(page.getByText("The text of the two files is identical")).toBeVisible();
  });

  test("warns that scanned files have no text to compare", async ({ page }) => {
    await load(page, await scanLikePdf(), await scanLikePdf());
    await expect(page.getByText(/Neither file has text that can be read/)).toBeVisible();
  });

  test("compares page pictures, finds the changed page and shows the difference", async ({ page }) => {
    await load(page, await textPdf([["Same page"], ["Old text here"]]), await textPdf([["Same page"], ["Completely new words"]]));
    await page.getByRole("radio", { name: "Page pictures" }).check({ force: true });
    await expect(page.getByText(/1 of 2 compared pages look different/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Page 1 same$/ })).toBeVisible();
    // The first changed page opens by itself.
    await expect(page.getByText(/Page 2 · [<\d.]+% differs/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: /faded, with the parts that differ in red/ })).toBeVisible();
    await page.getByRole("radio", { name: "Side by side" }).check({ force: true });
    await expect(page.getByRole("img", { name: "Page 2 of A" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Page 2 of B" })).toBeVisible();
    // Page 1 is identical.
    await page.getByRole("button", { name: /^Page 1 / }).click();
    await expect(page.getByText(/Page 1 · 0% differs/)).toBeVisible({ timeout: 30_000 });
  });

  test("notes pages that exist in only one file", async ({ page }) => {
    await load(page, await textPdf([["One"], ["Two"], ["Three"]]), await textPdf([["One"]]));
    await page.getByRole("radio", { name: "Page pictures" }).check({ force: true });
    await expect(page.getByText(/Only in A: pages 2–3/)).toBeVisible();
  });

  test("rejects a file that is not a PDF", async ({ page }) => {
    await page.goto("/tools/compare-pdf");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
    await expect(appAlert(page)).toContainText("does not look like a PDF");
  });

  test("has no WCAG A/AA violations on either tab", async ({ page }) => {
    await load(page, await textPdf(OLD), await textPdf(NEW));
    await expect(page.getByText("Changed pages in A: 1, 2. In B: 1, 2.")).toBeVisible();
    const scan = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    expect(await scan()).toEqual([]);
    await page.getByRole("radio", { name: "Page pictures" }).check({ force: true });
    await expect(page.getByText(/compared pages? look different/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: /faded, with the parts that differ in red/ })).toBeVisible({ timeout: 30_000 });
    expect(await scan()).toEqual([]);
  });
});
