import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { trackRequests } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** A PDF with a script on open, an author, an attached file and words on a hidden layer. */
async function dirty(name: string) {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  doc.setAuthor("Jane Doe");
  const page = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Visible words", { x: 20, y: 350, size: 14, font });
  doc.catalog.set(PDFName.of("OpenAction"), ctx.obj({ S: "JavaScript", JS: PDFString.of("app.alert('hi')") }));
  const file = ctx.register(ctx.flateStream("secret", { Type: "EmbeddedFile" }));
  doc.catalog.set(PDFName.of("Names"), ctx.obj({ EmbeddedFiles: { Names: [PDFString.of("budget.xlsx"), ctx.obj({ Type: "Filespec", F: PDFString.of("budget.xlsx"), EF: { F: file } })] } }));
  const ocg = ctx.register(ctx.obj({ Type: "OCG", Name: PDFHexString.fromText("Draft") }));
  doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: [ocg], D: { OFF: [ocg] } }));
  const resources = page.node.Resources() as PDFDict;
  resources.set(PDFName.of("Properties"), ctx.obj({ oc1: ocg }));
  const fontName = [...resources.lookup(PDFName.of("Font"), PDFDict).keys()][0]?.decodeText();
  page.node.set(PDFName.of("Contents"), ctx.obj([page.node.get(PDFName.of("Contents")), ctx.register(ctx.flateStream(`/OC /oc1 BDC BT /${fontName} 12 Tf 20 300 Td (HIDDEN) Tj ET EMC`))]));
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

async function download(page: Page) {
  const [got] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return { name: got.suggestedFilename(), path: (await got.path())! };
}

test.describe("Sanitize PDF", () => {
  test("lists what the PDF carries, removes it and checks the new file, without any request elsewhere", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/sanitize-pdf");
    await page.locator('input[type="file"]').setInputFiles(await dirty("report.pdf"));
    const panel = page.getByRole("region", { name: "What to remove" });
    await expect(panel.getByLabel("Scripts: 1 found")).toBeVisible();
    await expect(panel.getByLabel("Attached files: 1 found")).toBeVisible();
    await expect(panel.getByText("budget.xlsx")).toBeVisible();
    await expect(panel.getByLabel("Content on hidden layers: 1 found")).toBeVisible();
    await expect(panel.getByText(/author/)).toBeVisible();
    await page.getByRole("button", { name: "Clean PDF" }).click();
    await expect(page.getByText(/^Checked the new file: nothing you chose to remove is left\./)).toBeVisible();
    const out = await download(page);
    expect(out.name).toBe("report-clean.pdf");
    const doc = await PDFDocument.load(await readFile(out.path));
    expect(doc.catalog.has(PDFName.of("OpenAction"))).toBe(false);
    expect(doc.catalog.has(PDFName.of("Names")) && doc.catalog.lookup(PDFName.of("Names"), PDFDict).has(PDFName.of("EmbeddedFiles"))).toBe(false);
    expect(doc.getAuthor()).toBeUndefined();
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("cleans several PDFs into a ZIP", async ({ page }) => {
    await page.goto("/tools/sanitize-pdf");
    await page.locator('input[type="file"]').setInputFiles([await dirty("a.pdf"), await dirty("b.pdf")]);
    await expect(page.getByRole("region", { name: "What to remove" }).getByLabel("Scripts: 2 found")).toBeVisible();
    await page.getByRole("button", { name: "Clean 2 PDFs" }).click();
    expect((await download(page)).name).toBe("clean-pdfs.zip");
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/sanitize-pdf");
    await page.locator('input[type="file"]').setInputFiles(await dirty("report.pdf"));
    await expect(page.getByLabel("Scripts: 1 found")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});
