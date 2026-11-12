import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { woffToSfnt } from "../packages/core/src/pdf-text";
import { appAlert, trackRequests } from "./helpers";

async function memo(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Confidential memo");
  doc.setAuthor("Jane Q. Analyst");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 500]).drawText("Account SECRET-4821 belongs to Jane", { x: 40, y: 400, size: 14, font });
  doc.addPage([400, 500]).drawText("Public notes", { x: 40, y: 400, size: 14, font });
  return Buffer.from(await doc.save());
}

/** A PDF whose text is in an embedded font (Noto Sans), as most real documents are: the position of letters inside a line must come from that font. */
async function embeddedFontMemo(): Promise<{ pdf: Buffer; start: number; end: number }> {
  const fontkit = createRequire(join(process.cwd(), "packages", "core", "package.json"))("@pdf-lib/fontkit");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit.default ?? fontkit);
  const bytes = await woffToSfnt(new Uint8Array(readFileSync(join(process.cwd(), "apps", "web", "node_modules", "@fontsource", "noto-sans", "files", "noto-sans-latin-400-normal.woff"))));
  const font = await doc.embedFont(bytes, { subset: false, features: { ccmp: false } });
  doc.addPage([400, 500]).drawText("Account SECRET-4821 belongs to Jane", { x: 40, y: 400, size: 14, font });
  return { pdf: Buffer.from(await doc.save()), start: 40 + font.widthOfTextAtSize("Account ", 14), end: 40 + font.widthOfTextAtSize("Account SECRET-4821", 14) };
}

async function open(page: Page, name = "memo.pdf", buffer?: Buffer) {
  await page.goto("/tools/redact-pdf");
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: buffer ?? (await memo()) });
  await expect(page.getByRole("button", { name: "Add box" })).toBeVisible();
}

async function download(page: Page): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  return (await file.path())!;
}

/** Everything a reader could dig out of the file: raw bytes plus every decoded stream. */
async function everything(path: string): Promise<{ text: string; doc: PDFDocument }> {
  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const parts = [bytes.toString("latin1")];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      parts.push(Buffer.from(decodePDFRawStream(object).decode()).toString("latin1"));
    } catch {
      // A JPEG picture: pdf-lib does not decode it, and its raw bytes are already in the first part.
    }
  }
  return { text: parts.join("\n"), doc };
}

/** True when the text appears in the file as typed or as the hex string pdf-lib writes for it. */
function holds(text: string, word: string): boolean {
  return text.includes(word) || text.toUpperCase().includes(Buffer.from(word).toString("hex").toUpperCase());
}

/** The first picture stream of a page, as a base64 JPEG or PNG data URL. */
function pagePicture(doc: PDFDocument, index: number): string {
  const xobjects = doc.getPage(index).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
  for (const key of xobjects?.keys() ?? []) {
    const stream = xobjects!.lookup(key);
    if (stream instanceof PDFRawStream && stream.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) {
      const jpeg = stream.dict.get(PDFName.of("Filter")) === PDFName.of("DCTDecode");
      return `data:${jpeg ? "image/jpeg" : "image/png"};base64,${Buffer.from(jpeg ? stream.contents : decodePDFRawStream(stream).decode()).toString("base64")}`;
    }
  }
  throw new Error("no picture on the page");
}

/** Brightness (0 black … 255 white) of the picture at a share of its width and height. */
async function brightness(page: Page, dataUrl: string, at: Array<[number, number]>): Promise<number[]> {
  return page.evaluate(
    async ([url, points]) => {
      // Not fetch(): the page's own policy forbids data: URLs as a connection target.
      const [head, body = ""] = (url as string).split(",");
      const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: head?.slice(5, head.indexOf(";")) }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      return (points as Array<[number, number]>).map(([x, y]) => {
        const d = ctx.getImageData(Math.min(bitmap.width - 1, Math.floor(x * bitmap.width)), Math.min(bitmap.height - 1, Math.floor(y * bitmap.height)), 1, 1).data;
        return Math.round(((d[0] ?? 0) + (d[1] ?? 0) + (d[2] ?? 0)) / 3);
      });
    },
    [dataUrl, at] as const,
  );
}

test.describe("Redact PDF in a real browser", () => {
  test("a box drawn by hand removes the text under it and nothing is uploaded", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await open(page);
    await page.getByRole("button", { name: "Add box" }).click();
    // The new box is 160 × 24 pt in the middle of the 400 × 500 page. Line it up with the text on the page.
    await page.getByLabel("From left").fill("90");
    await page.getByLabel("From top").fill("84");
    await page.getByLabel("Width", { exact: true }).fill("100");
    await page.getByLabel("Height", { exact: true }).fill("22");
    await page.getByRole("button", { name: "Redact 1 area on 1 page" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();

    const { text, doc } = await everything(await download(page));
    expect(doc.getPageCount()).toBe(2);
    expect(holds(text, "SECRET")).toBe(false);
    expect(holds(text, "Account")).toBe(false);
    expect(holds(text, "Confidential memo")).toBe(false);
    expect(holds(text, "Analyst")).toBe(false);
    // Page 2 was not marked, so it is copied with its text.
    expect(holds(text, "Public notes")).toBe(true);

    // The picture is dark where the box is and light where the page is blank.
    const [inside, margin, belowText] = await brightness(page, pagePicture(doc, 0), [
      [140 / 400, 95 / 500],
      [10 / 400, 95 / 500],
      [250 / 400, 400 / 500],
    ]);
    expect(inside).toBeLessThan(30);
    expect(margin).toBeGreaterThan(240);
    expect(belowText).toBeGreaterThan(240);

    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
  });

  test("dragging across the page draws a box", async ({ page }) => {
    await open(page);
    const surface = page.getByTestId("redact-surface");
    await surface.scrollIntoViewIfNeeded();
    const rect = (await surface.boundingBox())!;
    await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.25, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByText("Box 1 · page 1")).toBeVisible();
    expect(Number(await page.getByLabel("From left").inputValue())).toBeCloseTo(80, -1);
    expect(Number(await page.getByLabel("Width", { exact: true }).inputValue())).toBeCloseTo(120, -1);
    // A tiny drag is a click, not a box.
    await page.mouse.move(rect.x + 10, rect.y + 10);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByText("Box 2 · page 1")).toHaveCount(0);
  });

  test("searching marks every match, and the search words are gone from the result", async ({ page }) => {
    await open(page);
    await page.getByLabel("Words to find").fill("SECRET-4821");
    await page.getByRole("button", { name: "Find and mark" }).click();
    await expect(page.getByText(/Marked 1 place on 1 page/)).toBeVisible();
    await page.getByRole("button", { name: "Redact 1 area on 1 page" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    const { text, doc } = await everything(await download(page));
    expect(holds(text, "SECRET")).toBe(false);
    // A search in a PDF-standard font cannot measure the letters, so it covers the whole piece of text: never too little.
    const [onMatch, atStart, atEnd] = await brightness(page, pagePicture(doc, 0), [
      [130 / 400, 96 / 500],
      [96 / 400, 96 / 500],
      [184 / 400, 96 / 500],
    ]);
    expect(atStart).toBeLessThan(30);
    expect(atEnd).toBeLessThan(30);
    expect(onMatch).toBeLessThan(30);
  });

  test("with an embedded font the box ends where the matched word ends, not at the end of the line", async ({ page }) => {
    const { pdf, start, end } = await embeddedFontMemo();
    await open(page, "embedded.pdf", pdf);
    await page.getByLabel("Words to find").fill("SECRET-4821");
    await page.getByRole("button", { name: "Find and mark" }).click();
    await expect(page.getByText(/Marked 1 place on 1 page/)).toBeVisible();
    await page.getByRole("button", { name: "Redact 1 area on 1 page" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    const { doc } = await everything(await download(page));
    const row = (from: number, to: number) => Array.from({ length: 20 }, (_, i) => [(from + ((to - from) * i) / 19) / 400, 95 / 500] as [number, number]);
    const dark = await brightness(page, pagePicture(doc, 0), row(start + 1, end - 1));
    const after = await brightness(page, pagePicture(doc, 0), row(end + 12, end + 70));
    const before = await brightness(page, pagePicture(doc, 0), row(42, start - 8));
    // Every sample across the word is black: none of its letters is left showing.
    expect(Math.max(...dark)).toBeLessThan(30);
    // Beside the word the page is mostly white, with a little text: nowhere near black.
    expect(after.reduce((a, b) => a + b, 0) / after.length).toBeGreaterThan(150);
    expect(before.reduce((a, b) => a + b, 0) / before.length).toBeGreaterThan(150);
  });

  test("email search works and a search with no match says so", async ({ page }) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([400, 500]).drawText("Write to jane.doe@example.com today", { x: 40, y: 400, size: 12, font });
    await open(page, "mail.pdf", Buffer.from(await doc.save()));
    await page.getByLabel("Look for").selectOption("email");
    await page.getByRole("button", { name: "Find and mark" }).click();
    await expect(page.getByText(/Marked 1 place on 1 page/)).toBeVisible();
    await page.getByLabel("Look for").selectOption("text");
    await page.getByLabel("Words to find").fill("nothing like this");
    await page.getByRole("button", { name: "Find and mark" }).click();
    await expect(page.getByText(/Nothing new was found/)).toBeVisible();
  });

  test("turning every page into a picture removes the text of unmarked pages too", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Add box" }).click();
    await page.getByRole("switch", { name: /Turn every page into a picture/ }).check();
    await page.getByRole("button", { name: "Redact 1 area on 1 page" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();
    await expect(page.getByText("2 pages rebuilt as pictures")).toBeVisible();
    const { text } = await everything(await download(page));
    expect(holds(text, "Public notes")).toBe(false);
  });

  test("the button waits for a box, and a box can be removed", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "Redact", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Add box" }).click();
    await expect(page.getByRole("button", { name: "Redact 1 area on 1 page" })).toBeEnabled();
    await page.getByRole("button", { name: "Remove box 1" }).click();
    await expect(page.getByRole("button", { name: "Redact", exact: true })).toBeDisabled();
  });

  test("rejects a file that is not a PDF", async ({ page }) => {
    await page.goto("/tools/redact-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
    await expect(appAlert(page)).toContainText("does not look like a PDF");
  });

  test("has no WCAG A/AA violations with a file and boxes", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Add box" }).click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
