import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, degrees } from "pdf-lib";
import { makePng, trackRequests } from "./helpers";

/** A two-page letter: page 1 has a line of text to edit, page 2 is stored turned by 90°. */
async function letter(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([400, 500]);
  first.drawText("Invoice total: 120 EUR", { x: 40, y: 420, size: 16, font });
  first.drawText("Thank you for your business", { x: 40, y: 380, size: 12, font });
  for (let i = 1; i < pages; i++) {
    const page = doc.addPage([400, 500]);
    if (i === 1) page.setRotation(degrees(90));
    page.drawText(`Page ${i + 1}`, { x: 40, y: 420, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function open(page: Page, buffer?: Buffer) {
  await page.goto("/tools/edit-pdf");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: buffer ?? (await letter()) });
  await expect(page.getByRole("toolbar", { name: "Editing tools" })).toBeVisible();
  await expect(page.getByTestId("edit-surface")).toBeVisible();
  // Wait for the page picture, so clicks land on a page that is fully laid out.
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
}

const tool = (page: Page, name: string) => page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name, exact: true });
const edits = (page: Page) => page.getByRole("list", { name: /Edits on page/ }).getByRole("listitem");

/** Clicks or drags on the page at points given as shares of its width and height. */
async function onPage(page: Page, from: [number, number], to?: [number, number]) {
  await page.getByTestId("edit-surface").scrollIntoViewIfNeeded();
  const box = (await page.getByTestId("edit-surface").boundingBox())!;
  const at = ([u, v]: [number, number]) => [box.x + u * box.width, box.y + v * box.height] as const;
  const [x0, y0] = at(from);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  if (to) {
    const [x1, y1] = at(to);
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
    await page.mouse.move(x1, y1, { steps: 4 });
  }
  await page.mouse.up();
}

async function save(page: Page): Promise<PDFDocument> {
  await page.getByRole("button", { name: /^Save PDF with \d+ edits?$/ }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("letter-edited.pdf");
  return PDFDocument.load(await readFile((await file.path())!));
}

/** Everything drawn on a page, as content-stream text. */
function contentOf(doc: PDFDocument, index = 0): string {
  const contents = doc.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_, i) => doc.context.lookup(contents.get(i))) : [contents];
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
}

/** pdf-lib writes standard-font text as hex strings. */
const hexOf = (text: string) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

test.describe("Edit PDF in a real browser", () => {
  test("types new text on the page and saves it into the PDF, with nothing sent anywhere", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await open(page);
    await tool(page, "Add text").click();
    await onPage(page, [0.1, 0.4]);
    const field = page.getByRole("textbox", { name: "Text on the page" });
    await expect(field).toBeFocused();
    await page.keyboard.type("Approved by the board");
    await page.keyboard.press("Escape");
    await expect(edits(page)).toHaveText([/Text: “Approved by the board”/]);

    const doc = await save(page);
    expect(doc.getPageCount()).toBe(2);
    expect(contentOf(doc)).toContain(hexOf("Approved by the board"));
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("changes a line of the PDF's own text: covers it and writes the new words in the same size", async ({ page }) => {
    await open(page);
    await tool(page, "Edit existing text").click();
    const lines = page.getByTestId("text-line");
    await expect(lines).toHaveCount(2);
    await lines.first().click();
    const field = page.getByRole("textbox", { name: "Text on the page" });
    await expect(field).toHaveValue("Invoice total: 120 EUR");
    await field.fill("Invoice total: 95 EUR");
    await field.press("Escape");
    await expect(edits(page)).toHaveText([/Edited text: “Invoice total: 95 EUR”/]);
    // The edited line is no longer offered.
    await expect(lines).toHaveCount(1);

    // The properties panel shows the size read from the PDF.
    await tool(page, "Select and move").click();
    await edits(page).first().getByRole("button").click();
    await expect(page.getByRole("spinbutton", { name: "Size" })).toHaveValue("16");

    const content = contentOf(await save(page));
    const cover = content.indexOf("h\nf");
    expect(cover).toBeGreaterThan(-1);
    expect(content.indexOf(hexOf("Invoice total: 95 EUR"))).toBeGreaterThan(cover);
  });

  test("highlights fit the line of text they are dragged across, and multiply with the page", async ({ page }) => {
    await open(page);
    await tool(page, "Highlight").click();
    await expect(page.getByRole("switch", { name: "Fit highlights to the lines of text" })).toBeChecked();
    // "Invoice total" sits 80 pt from the top of a 500 pt page, from 40 pt in.
    await onPage(page, [0.12, 0.15], [0.5, 0.155]);
    await expect(edits(page)).toHaveText(["Highlight"]);
    const doc = await save(page);
    const states = doc.getPage(0).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
    expect(states.keys().map((k) => String(states.lookup(k, PDFDict).get(PDFName.of("BM"))))).toContain("/Multiply");
  });

  test("draws shapes, freehand and marks, with undo, redo and delete from the keyboard", async ({ page }) => {
    await open(page);
    await tool(page, "Rectangle").click();
    await onPage(page, [0.2, 0.5], [0.6, 0.7]);
    await tool(page, "Draw").click();
    await onPage(page, [0.1, 0.8], [0.4, 0.9]);
    await tool(page, "Check mark").click();
    await onPage(page, [0.8, 0.2]);
    await expect(edits(page)).toHaveText(["Check mark", "Drawing", "Rectangle"]);

    await page.keyboard.press("Control+z");
    await expect(edits(page)).toHaveText(["Drawing", "Rectangle"]);
    await page.keyboard.press("Control+Shift+z");
    await expect(edits(page)).toHaveText(["Check mark", "Drawing", "Rectangle"]);

    await edits(page).filter({ hasText: "Rectangle" }).getByRole("button").click();
    await expect(page.getByTestId("selection")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Delete");
    await expect(edits(page)).toHaveText(["Check mark", "Drawing"]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(edits(page)).toHaveText(["Check mark", "Drawing", "Rectangle"]);

    const content = contentOf(await save(page));
    // The freehand line has round caps and joins; the check mark is a stroked path too.
    expect(content).toContain("1 j");
    expect(content).toContain("1 J");
  });

  test("moves an edit by dragging it, and resizes a picture keeping its shape", async ({ page }) => {
    await open(page);
    await page.getByLabel("Choose a picture to add").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await makePng(page, 200, 100) });
    await expect(edits(page)).toHaveText(["Picture"]);
    const width = page.getByLabel("Width", { exact: true });
    const height = page.getByLabel("Height", { exact: true });
    const ratio = Number(await width.inputValue()) / Number(await height.inputValue());
    expect(ratio).toBeCloseTo(2, 1);
    const left = Number(await page.getByLabel("From left").inputValue());

    // Drag the picture from its middle 40 px to the right.
    await page.getByTestId("edit-surface").scrollIntoViewIfNeeded();
    const sel = (await page.getByTestId("selection").boundingBox())!;
    await page.mouse.move(sel.x + sel.width / 2, sel.y + sel.height / 2);
    await page.mouse.down();
    await page.mouse.move(sel.x + sel.width / 2 + 20, sel.y + sel.height / 2, { steps: 3 });
    await page.mouse.move(sel.x + sel.width / 2 + 40, sel.y + sel.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect.poll(async () => Number(await page.getByLabel("From left").inputValue())).toBeGreaterThan(left + 10);

    // Drag the bottom-right corner outwards: the picture grows and stays twice as wide as it is tall.
    const corner = (await page.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + 60, corner.y + 10, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Number(await width.inputValue())).toBeGreaterThan(ratio * Number(await height.inputValue()) - 1);
    expect(Number(await width.inputValue()) / Number(await height.inputValue())).toBeCloseTo(2, 1);

    const doc = await save(page);
    const images = doc.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of("Subtype"))) === "/Image");
    expect(images.length).toBe(1);
  });

  test("copies an edit to every page and lists the edits per page", async ({ page }) => {
    await open(page, await letter(3));
    await tool(page, "Add text").click();
    await page.getByRole("button", { name: "Add to the middle of the page" }).click();
    await page.keyboard.press("Escape");
    await tool(page, "Select and move").click();
    await edits(page).first().getByRole("button").click();
    await page.getByRole("button", { name: "Copy to every page" }).click();
    await expect(page.getByText("Copied to the other 2 pages.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Page 2, 1 edit" })).toBeVisible();
    await page.getByRole("button", { name: "Page 3, 1 edit" }).click();
    await expect(page.getByText("Page 3 of 3")).toBeVisible();
    await expect(edits(page)).toHaveText([/Text: “Text”/]);
    const doc = await save(page);
    for (const i of [0, 1, 2]) expect(contentOf(doc, i)).toContain(hexOf("Text"));
  });

  test("an empty text box is dropped again, and keyboard users can add things without a mouse", async ({ page }) => {
    await open(page);
    await tool(page, "Add text").click();
    await onPage(page, [0.5, 0.5]);
    await page.keyboard.press("Escape");
    await expect(page.getByText("No edits on page 1 yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

    await tool(page, "Ellipse").click();
    await page.getByRole("button", { name: "Add to the middle of the page" }).click();
    await expect(edits(page)).toHaveText(["Ellipse"]);
    await page.getByLabel("From left").fill("10");
    await expect(page.getByLabel("From left")).toHaveValue("10");
  });

  test("has no WCAG A/AA violations with an edit selected", async ({ page }) => {
    await open(page);
    await tool(page, "Rectangle").click();
    await page.getByRole("button", { name: "Add to the middle of the page" }).click();
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
});
