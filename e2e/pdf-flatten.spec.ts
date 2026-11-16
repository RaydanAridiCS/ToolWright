import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { trackRequests } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** A form with one filled text field, a ticked box and a highlight. */
async function form(name: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const f = doc.getForm();
  const field = f.createTextField("name");
  field.addToPage(page, { x: 50, y: 600, width: 200, height: 24, font });
  field.setText("Ada");
  const box = f.createCheckBox("agree");
  box.addToPage(page, { x: 50, y: 560, width: 16, height: 16 });
  box.check();
  const ap = doc.context.register(doc.context.flateStream("1 1 0 rg 0 0 50 10 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 50, 10] }));
  const highlight = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Highlight", Rect: [50, 700, 100, 710], AP: { N: ap } }));
  page.node.Annots()?.push(highlight);
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

async function download(page: Page) {
  const [got] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return { name: got.suggestedFilename(), path: (await got.path())! };
}

test.describe("Flatten PDF", () => {
  test("shows what the PDF holds and flattens it without any request elsewhere", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/flatten-pdf");
    await page.locator('input[type="file"]').setInputFiles(await form("application.pdf"));
    const summary = page.getByRole("region", { name: "What the PDF has" });
    await expect(summary.getByText("2 (2 filled in)")).toBeVisible();
    await expect(summary.getByText("1: 1 highlight")).toBeVisible();
    await page.getByRole("button", { name: "Flatten PDF" }).click();
    await expect(page.getByText("Checked the new file: 0 fillable fields, 0 comments and 0 links left.")).toBeVisible();
    const out = await download(page);
    expect(out.name).toBe("application-flattened.pdf");
    const doc = await PDFDocument.load(await readFile(out.path));
    expect(doc.catalog.has(PDFName.of("AcroForm"))).toBe(false);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("flattens several PDFs into a ZIP, and only the comments when asked", async ({ page }) => {
    await page.goto("/tools/flatten-pdf");
    await page.locator('input[type="file"]').setInputFiles([await form("a.pdf"), await form("b.pdf")]);
    await expect(page.getByText("4 form fields and 2 comments and marks in all.")).toBeVisible();
    await page.getByRole("switch", { name: "Form fields" }).uncheck({ force: true });
    await page.getByRole("button", { name: "Flatten 2 PDFs" }).click();
    const out = await download(page);
    expect(out.name).toBe("flattened-pdfs.zip");
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/flatten-pdf");
    await page.locator('input[type="file"]').setInputFiles(await form("application.pdf"));
    await expect(page.getByText("2 (2 filled in)")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});
