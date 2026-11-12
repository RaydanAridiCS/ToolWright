import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { appAlert, trackRequests } from "./helpers";

async function formPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const form = doc.getForm();
  form.createTextField("full_name").addToPage(page, { x: 40, y: 440, width: 220, height: 24 });
  const notes = form.createTextField("notes");
  notes.enableMultiline();
  notes.addToPage(page, { x: 40, y: 360, width: 300, height: 60 });
  form.createCheckBox("agree").addToPage(page, { x: 40, y: 320, width: 18, height: 18 });
  const country = form.createDropdown("country");
  country.addOptions(["Canada", "Chile"]);
  country.addToPage(page, { x: 40, y: 270, width: 160, height: 24 });
  const locked = form.createTextField("locked");
  locked.setText("fixed");
  locked.enableReadOnly();
  locked.addToPage(page, { x: 40, y: 230, width: 100, height: 24 });
  return Buffer.from(await doc.save());
}

async function flatPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 500]);
  doc.addPage([400, 500]);
  return Buffer.from(await doc.save());
}

const hex = (text: string) => Buffer.from(text).toString("hex").toUpperCase();

function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents();
  const streams = contents && "size" in contents ? Array.from({ length: contents.size() }, (_, i) => doc.context.lookup(contents.get(i))) : [contents];
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
}

async function open(page: Page, name: string, buffer: Buffer) {
  await page.goto("/tools/fill-pdf-form");
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer });
}

async function download(page: Page): Promise<PDFDocument> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  return PDFDocument.load(await readFile((await file.path())!));
}

test.describe("Fill PDF Form in a real browser", () => {
  test("fills the fields, keeps the form editable and uploads nothing", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await open(page, "application.pdf", await formPdf());
    await expect(page.getByRole("radio", { name: /Form fields \(5\)/ })).toBeChecked();
    await page.getByLabel("full_name").fill("Grace Hopper");
    await page.getByLabel("notes").fill("first line\nsecond line");
    await page.getByRole("switch", { name: "agree" }).check();
    await page.getByLabel("country").selectOption("Chile");
    await expect(page.getByLabel("locked")).toBeDisabled();

    await page.getByRole("button", { name: "Create filled PDF" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    const doc = await download(page);
    const form = doc.getForm();
    expect(form.getTextField("full_name").getText()).toBe("Grace Hopper");
    expect(form.getTextField("notes").getText()).toBe("first line\nsecond line");
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(form.getDropdown("country").getSelected()).toEqual(["Chile"]);
    expect(form.getTextField("locked").getText()).toBe("fixed");
    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("flattens the form so the entries become page content", async ({ page }) => {
    await open(page, "application.pdf", await formPdf());
    await page.getByLabel("full_name").fill("Ada Lovelace");
    await page.getByRole("switch", { name: /Flatten the form/ }).check();
    await page.getByRole("button", { name: "Fill and flatten" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    const doc = await download(page);
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(doc.getPageCount()).toBe(1);
  });

  test("only enables the button once something is changed", async ({ page }) => {
    await open(page, "application.pdf", await formPdf());
    await expect(page.getByRole("button", { name: "Create filled PDF" })).toBeDisabled();
    await page.getByLabel("full_name").fill("x");
    await expect(page.getByRole("button", { name: "Create filled PDF" })).toBeEnabled();
    await page.getByLabel("full_name").fill("");
    await expect(page.getByRole("button", { name: "Create filled PDF" })).toBeDisabled();
  });

  test("names the field when a character cannot be printed", async ({ page }) => {
    await open(page, "application.pdf", await formPdf());
    await page.getByLabel("full_name").fill("名前");
    await page.getByRole("button", { name: "Create filled PDF" }).click();
    await expect(appAlert(page)).toContainText("“full_name” has characters the form's font cannot print");
  });

  test("types onto a flat page by clicking, and moves the text with the position fields", async ({ page }) => {
    await open(page, "flat.pdf", await flatPdf());
    await expect(page.getByText("This PDF has no form fields.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Form fields/ })).toHaveCount(0);

    const preview = page.getByRole("button", { name: /Page preview. Click to add text here/ });
    await expect(preview).toBeVisible();
    await preview.click({ position: { x: 100, y: 60 } });
    await page.getByLabel("Text 1", { exact: true }).fill("Jane Doe");
    await page.getByLabel("From left").fill("120");
    await page.getByLabel("From top").fill("200");
    await page.getByRole("button", { name: "Nudge down" }).click();
    await expect(page.getByLabel("From top")).toHaveValue("204");

    // A second piece of text on page 2.
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Add X mark" }).click();

    await page.getByRole("button", { name: "Create filled PDF" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    const doc = await download(page);
    expect(pageContent(doc, 0)).toContain(hex("Jane Doe"));
    expect(pageContent(doc, 1)).toContain(hex("X"));
    expect(pageContent(doc, 0)).not.toContain(hex("X"));
  });

  test("removes added text", async ({ page }) => {
    await open(page, "flat.pdf", await flatPdf());
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await expect(page.getByLabel("Text 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove text 1" }).click();
    await expect(page.getByLabel("Text 1", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create filled PDF" })).toBeDisabled();
  });

  test("rejects a file that is not a PDF", async ({ page }) => {
    await open(page, "notes.pdf", Buffer.from("not a pdf"));
    await expect(appAlert(page)).toContainText("does not look like a PDF");
  });

  test("has no WCAG A/AA violations in either mode", async ({ page }) => {
    await open(page, "application.pdf", await formPdf());
    await expect(page.getByLabel("full_name")).toBeVisible();
    const scan = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    expect(await scan()).toEqual([]);
    await page.getByRole("radio", { name: "Type on the page" }).check({ force: true });
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await expect(page.getByLabel("Text 1", { exact: true })).toBeVisible();
    expect(await scan()).toEqual([]);
  });
});
