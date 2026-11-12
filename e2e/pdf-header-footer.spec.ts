import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { appAlert, trackRequests } from "./helpers";

async function threePages(size: [number, number] = [400, 500]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage(size);
  return Buffer.from(await doc.save());
}

const hex = (text: string) => Buffer.from(text).toString("hex").toUpperCase();

/** Everything drawn on a page, decoded, so text can be looked for as pdf-lib writes it (a hex string). */
function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents();
  // A page nothing was drawn on has no content stream at all.
  if (!contents) return "";
  const streams = contents && "size" in contents ? Array.from({ length: contents.size() }, (_, i) => doc.context.lookup(contents.get(i))) : [contents];
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
}

async function open(page: Page, buffer?: Buffer) {
  await page.goto("/tools/pdf-header-footer");
  await page.locator('input[type="file"]').setInputFiles({ name: "contract.pdf", mimeType: "application/pdf", buffer: buffer ?? (await threePages()) });
  await expect(page.getByLabel("Footer, middle")).toBeVisible();
}

async function download(page: Page): Promise<PDFDocument> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  return PDFDocument.load(await readFile((await file.path())!), { updateMetadata: false });
}

test.describe("Add Header and Footer to PDF in a real browser", () => {
  test("stamps page numbers, the date and the file name, and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await open(page);
    await page.getByLabel("Text for {date}").fill("15 March 2026");
    await page.getByLabel("Header, left").fill("{file}");
    await page.getByLabel("Header, right").fill("{date}");
    await page.getByRole("button", { name: "Add header and footer" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    await expect(page.getByText("3 pages stamped")).toBeVisible();

    const doc = await download(page);
    for (let i = 0; i < 3; i++) {
      const content = pageContent(doc, i);
      expect(content).toContain(hex(`Page ${i + 1} of 3`));
      expect(content).toContain(hex("contract"));
      expect(content).toContain(hex("15 March 2026"));
    }
    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("Bates numbering counts up from the first stamped page and can skip the cover", async ({ page }) => {
    await open(page);
    await page.getByLabel("Start from a layout").selectOption({ label: "Bates numbers, bottom right" });
    await expect(page.getByLabel("Footer, right")).toHaveValue("{bates}");
    await expect(page.getByLabel("Footer, middle")).toHaveValue("");
    await page.getByLabel("Prefix").fill("ACME-");
    await page.getByLabel("First number").fill("101");
    await expect(page.getByText("ACME-000101").first()).toBeVisible();
    await page.getByRole("switch", { name: "Leave the first page blank" }).check();
    await expect(page.getByText("2 of 3 pages will be stamped.")).toBeVisible();
    await page.getByRole("button", { name: "Add header and footer" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();

    const doc = await download(page);
    expect(pageContent(doc, 0)).not.toContain(hex("ACME"));
    expect(pageContent(doc, 1)).toContain(hex("ACME-000101"));
    expect(pageContent(doc, 2)).toContain(hex("ACME-000102"));
  });

  test("the preview follows the text and the page, and an unstamped page says so", async ({ page }) => {
    await open(page);
    const preview = page.getByTestId("stamp-preview");
    await expect(preview).toContainText("Page 1 of 3");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(preview).toContainText("Page 2 of 3");
    await page.getByRole("switch", { name: "Leave the first page blank" }).check();
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(preview).not.toContainText("Page 1 of 3");
    await expect(page.getByText("This page is not stamped.")).toBeVisible();
  });

  test("a token button writes into the box that was used last", async ({ page }) => {
    await open(page);
    await page.getByLabel("Header, right").fill("Draft ");
    await page.getByRole("button", { name: "Date", exact: true }).click();
    await expect(page.getByLabel("Header, right")).toHaveValue("Draft {date}");
    await expect(page.getByLabel("Footer, middle")).toHaveValue("Page {page} of {pages}");
  });

  test("odd pages only, and a bad page list is explained", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "Choose" }).check({ force: true });
    await page.getByLabel("Pages", { exact: true }).fill("9");
    await expect(page.getByText(/out of range/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add header and footer" })).toBeDisabled();
    await page.getByRole("radio", { name: "Odd" }).check({ force: true });
    await expect(page.getByText("2 of 3 pages will be stamped.")).toBeVisible();
    await page.getByRole("button", { name: "Add header and footer" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    const doc = await download(page);
    expect(pageContent(doc, 0)).toContain(hex("Page 1 of 3"));
    expect(pageContent(doc, 1)).not.toContain(hex("Page 2 of 3"));
    expect(pageContent(doc, 2)).toContain(hex("Page 3 of 3"));
  });

  test("says which row has text that runs together", async ({ page }) => {
    await open(page, await threePages([200, 300]));
    await page.getByLabel("Footer, middle").fill("");
    await page.getByLabel("Footer, left").fill("A fairly long left piece");
    await page.getByLabel("Footer, right").fill("and a long right piece");
    await page.getByRole("button", { name: "Add header and footer" }).click();
    await expect(appAlert(page)).toContainText("On page 1, the footer: the left and right text run into each other");
  });

  test("an empty form cannot be run, and Cyrillic text fetches its font from this site", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await open(page);
    await page.getByLabel("Footer, middle").fill("");
    await expect(page.getByRole("button", { name: "Add header and footer" })).toBeDisabled();
    await page.getByLabel("Header, middle").fill("КОНФИДЕНЦИАЛЬНО");
    await page.getByRole("button", { name: "Add header and footer" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    expect(tracker.all.some((r) => r.url().includes("/fonts/noto-sans/noto-sans-cyrillic-400-normal.woff"))).toBe(true);
    expect(tracker.external(baseURL!)).toEqual([]);
    await download(page);
  });

  test("rejects a file that is not a PDF", async ({ page }) => {
    await page.goto("/tools/pdf-header-footer");
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
    await expect(appAlert(page)).toContainText("does not look like a PDF");
  });

  test("has no WCAG A/AA violations with a file, in the Bates layout", async ({ page }) => {
    await open(page);
    await page.getByLabel("Start from a layout").selectOption({ label: "Bates numbers, bottom right" });
    await expect(page.getByLabel("Prefix")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
