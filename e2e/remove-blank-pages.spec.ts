import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { appAlert, trackRequests } from "./helpers";

/**
 * Pages: 1 body text, 2 empty, 3 only a small page number, 4 empty, 5 a short heading, 6 a faint off-white scan with dust, 7 only a footer line.
 * Page size is A4-like so the measured shares match real documents.
 */
async function mixedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size: [number, number] = [595, 842];

  const body = doc.addPage(size);
  for (let i = 0; i < 40; i++) body.drawText("The quick brown fox jumps over the lazy dog, again and again.", { x: 60, y: 780 - i * 17, size: 11, font });

  doc.addPage(size);

  const number = doc.addPage(size);
  number.drawText("3", { x: 292, y: 40, size: 10, font });

  doc.addPage(size);

  const heading = doc.addPage(size);
  heading.drawText("Chapter two", { x: 60, y: 700, size: 28, font });

  const scan = doc.addPage(size);
  scan.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.93, 0.92, 0.88) });
  for (let i = 0; i < 8; i++) scan.drawCircle({ x: 100 + i * 60, y: 250 + i * 55, size: 1, color: rgb(0.35, 0.35, 0.35) });

  const footer = doc.addPage(size);
  footer.drawText("Page 7 of 12", { x: 250, y: 30, size: 9, font });

  return Buffer.from(await doc.save());
}

// "Page 1" must not match "Page 10": the page number is followed by a space, not another digit.
const label = (page: Page, n: number) => page.getByRole("button", { name: new RegExp("^Page " + n + " ") });

async function openMixed(page: Page) {
  await page.goto("/tools/remove-blank-pages");
  await page.locator('input[type="file"]').setInputFiles({ name: "mixed.pdf", mimeType: "application/pdf", buffer: await mixedPdf() });
  await expect(page.getByText(/of 7 pages? will be removed/)).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0, { timeout: 30_000 });
}

test.describe("Remove Blank Pages in a real browser", () => {
  test("finds the empty and dusty pages, removes them, and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await openMixed(page);
    // Normal: empty pages 2 and 4, dust on 6 and the lone page number on 3 go; text, heading and footer stay.
    const expected: Record<number, "true" | "false"> = { 1: "false", 2: "true", 3: "true", 4: "true", 5: "false", 6: "true", 7: "false" };
    for (const [n, pressed] of Object.entries(expected)) await expect(label(page, Number(n)), `page ${n}`).toHaveAttribute("aria-pressed", pressed);
    await expect(page.getByText(/4 of 7 pages will be removed \(2-4, 6\)/)).toBeVisible();

    await page.getByRole("button", { name: "Remove 4 pages" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    await expect(page.getByText(/Removed 4 pages \(2-4, 6\)\. The new file has 3 pages\./)).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("mixed-no-blank-pages.pdf");
    expect((await PDFDocument.load(await readFile((await download.path())!))).getPageCount()).toBe(3);
    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("strict keeps near-empty pages and loose also drops a footer-only page", async ({ page }) => {
    await openMixed(page);
    await page.getByRole("radio", { name: "Strict" }).check({ force: true });
    await expect(page.getByText(/2 of 7 pages will be removed \(2, 4\)/)).toBeVisible();
    await page.getByRole("radio", { name: "Loose" }).check({ force: true });
    await expect(page.getByText(/5 of 7 pages will be removed \(2-4, 6-7\)/)).toBeVisible();
    await expect(label(page, 5)).toHaveAttribute("aria-pressed", "false");
    await expect(label(page, 1)).toHaveAttribute("aria-pressed", "false");
  });

  test("shows only the pages to remove on request", async ({ page }) => {
    await openMixed(page);
    await page.getByRole("radio", { name: "Only pages to remove" }).check({ force: true });
    await expect(page.getByRole("group", { name: "Pages" }).getByRole("button")).toHaveCount(4);
  });

  test("clicking a page overrides the automatic choice", async ({ page }) => {
    await openMixed(page);
    await label(page, 2).click();
    await expect(label(page, 2)).toHaveAttribute("aria-pressed", "false");
    await expect(label(page, 2)).toContainText("your choice");
    await label(page, 1).click();
    await expect(label(page, 1)).toHaveAttribute("aria-pressed", "true");
    await label(page, 1).click();
    await expect(label(page, 1)).not.toContainText("your choice");
  });

  test("refuses to remove every page and handles non-PDF files", async ({ page }) => {
    await page.goto("/tools/remove-blank-pages");
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    await page.locator('input[type="file"]').setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
    await expect(page.getByText(/Every page is marked for removal/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Remove 1 page/ })).toBeDisabled();

    await page.goto("/tools/remove-blank-pages");
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
    await expect(appAlert(page)).toContainText("does not look like a PDF");
  });

  test("has no WCAG A/AA violations with results shown", async ({ page }) => {
    await openMixed(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
