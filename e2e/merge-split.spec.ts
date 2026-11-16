import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument, PDFName, type PDFRef } from "pdf-lib";
import { readOutline, writeOutline } from "../packages/core/src/pdf-outline";
import { trackRequests } from "./helpers";

/** File `id`'s page k is (id*100 + k) points wide, so pages can be told apart in the result. */
async function file(name: string, id: number, pages: number, build?: (doc: PDFDocument) => void | Promise<void>) {
  const doc = await PDFDocument.create();
  for (let k = 0; k < pages; k++) doc.addPage([id * 100 + k, 400]);
  await build?.(doc);
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

const chapters = (doc: PDFDocument) => {
  const p = doc.getPages().map((x) => x.ref as PDFRef);
  writeOutline(doc, [
    { title: "Introduction", pageRef: p[0]!, children: [] },
    { title: "Chapter One", pageRef: p[2]!, children: [] },
    { title: "Chapter Two", pageRef: p[4]!, children: [] },
  ]);
};

async function download(page: Page, name: string | RegExp = "Download") {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name, exact: typeof name === "string" }).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

const widths = async (bytes: Buffer) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

test.describe("Merge PDF", () => {
  test("takes chosen pages of each file, adds a bookmark per file and keeps the files' own", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("Letter.pdf", 1, 3), await file("Manual.pdf", 2, 6, chapters)]);
    await page.getByLabel("Pages of Manual.pdf").fill("1-3");
    await expect(page.getByText(/6 pages · taking 3/)).toBeVisible();
    await page.getByLabel("File name").fill("bundle");
    await page.getByRole("button", { name: /^Merge 2 PDFs \(6 pages\)/ }).click();
    const merged = await download(page);
    expect(merged.name).toBe("bundle.pdf");
    expect(await widths(merged.bytes)).toEqual([100, 101, 102, 200, 201, 202]);
    const outline = readOutline(await PDFDocument.load(merged.bytes));
    expect(outline.map((o) => [o.title, o.page])).toEqual([
      ["Letter", 0],
      ["Manual", 3],
    ]);
    // Chapter Two starts on page 5 of the manual, which was left out.
    expect(outline[1]!.children.map((o) => [o.title, o.page])).toEqual([
      ["Introduction", 3],
      ["Chapter One", 5],
    ]);
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("reorders files by dragging, and arranges single pages across files", async ({ page }) => {
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("a.pdf", 1, 2), await file("b.pdf", 2, 2)]);
    const rows = page.getByRole("list", { name: "Files to merge, in order" }).getByRole("listitem");
    await rows.nth(1).dragTo(rows.nth(0));
    await expect(rows.first()).toContainText("b.pdf");

    await page.getByRole("radio", { name: "Single pages" }).check({ force: true });
    const pages = page.getByRole("list", { name: "Pages of the merged file, in order" }).getByRole("listitem");
    await expect(pages).toHaveCount(4);
    // Letters follow the file order, so b.pdf is now A: the pages are A1 A2 B1 B2 (b, b, a, a).
    // Put B page 1 (a.pdf's first page) first, turn it, and drop A page 2.
    await page.getByRole("button", { name: "Move B page 1 earlier" }).click();
    await page.getByRole("button", { name: "Move B page 1 earlier" }).click();
    await page.getByRole("button", { name: "Turn B page 1 clockwise" }).click();
    await page.getByRole("button", { name: "Remove A page 2" }).click();
    await expect(pages).toHaveCount(3);
    await page.getByRole("button", { name: /^Merge 2 PDFs \(3 pages\)/ }).click();
    const merged = await download(page);
    const doc = await PDFDocument.load(merged.bytes);
    expect(doc.getPages().map((p) => [Math.round(p.getWidth()), p.getRotation().angle])).toEqual([
      [100, 90],
      [200, 0],
      [101, 0],
    ]);
  });

  test("keeps forms fillable and says which fields were renamed, and adds blank pages for double-sided printing", async ({ page }) => {
    const form = async (doc: PDFDocument) => {
      doc.getForm().createTextField("name").addToPage(doc.getPage(0), { x: 10, y: 10 });
    };
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("one.pdf", 1, 1, form), await file("two.pdf", 2, 1, form)]);
    await page.getByRole("switch", { name: "Start each file on a right-hand page" }).check({ force: true });
    await expect(page.getByText("2 files · 2 pages + 1 blank")).toBeVisible();
    await page.getByRole("button", { name: /^Merge 2 PDFs/ }).click();
    await expect(page.getByText(/1 form field was renamed/)).toBeVisible();
    const merged = await download(page);
    const doc = await PDFDocument.load(merged.bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(
      doc
        .getForm()
        .getFields()
        .map((f) => f.getName())
        .sort(),
    ).toEqual(["name", "name_2"]);
    expect(doc.catalog.get(PDFName.of("AcroForm"))).toBeDefined();
  });

  test("has no WCAG A/AA violations in either view", async ({ page }) => {
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([await file("a.pdf", 1, 2), await file("b.pdf", 2, 2)]);
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await page.getByRole("radio", { name: "Single pages" }).check({ force: true });
    await expect(page.getByRole("list", { name: "Pages of the merged file, in order" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
});

test.describe("Split PDF", () => {
  test("splits where the scissors are clicked", async ({ page }) => {
    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("report.pdf", 1, 6));
    // The first suggestion splits the file in half.
    await expect(page.getByText("Makes 2 files.")).toBeVisible();
    await page.getByRole("button", { name: "Split between pages 1 and 2" }).click();
    await expect(page.getByRole("button", { name: "Split between pages 1 and 2" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Join pages 1 and 2 into one file" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Makes 3 files.")).toBeVisible();
    await page.getByRole("button", { name: "Split into 3 files" }).click();
    const zip = await download(page, /Download all/);
    const entries = unzipSync(new Uint8Array(zip.bytes));
    expect(Object.keys(entries).sort()).toEqual(["report-1.pdf", "report-2.pdf", "report-3.pdf"]);
    expect(await widths(Buffer.from(entries["report-2.pdf"]!))).toEqual([101, 102]);
  });

  test("starts a file at each bookmark, named after it", async ({ page }) => {
    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("book.pdf", 1, 6, chapters));
    await page.getByRole("radio", { name: "At bookmarks" }).check({ force: true });
    await expect(page.getByText("3 bookmarks start a file")).toBeVisible();
    await page.getByRole("button", { name: "Split into 3 files" }).click();
    await expect(page.getByText("book-2-chapter-one.pdf")).toBeVisible();
    const zip = await download(page, /Download all/);
    expect(Object.keys(unzipSync(new Uint8Array(zip.bytes))).sort()).toEqual(["book-1-introduction.pdf", "book-2-chapter-one.pdf", "book-3-chapter-two.pdf"]);
  });

  test("says when there are no bookmarks, and splits odd and even pages", async ({ page }) => {
    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("scan.pdf", 1, 5));
    await page.getByRole("radio", { name: "At bookmarks" }).check({ force: true });
    await expect(page.getByText("This PDF has no bookmarks that point to its pages.")).toBeVisible();
    await page.getByRole("radio", { name: "Odd and even" }).check({ force: true });
    await page.getByRole("button", { name: "Split into 2 files" }).click();
    await expect(page.getByText("scan-2-even-pages.pdf")).toBeVisible();
  });

  test("keeps every file under a size limit", async ({ page }) => {
    const heavy = await (async () => {
      const doc = await PDFDocument.create();
      let seed = 3;
      for (let k = 0; k < 8; k++) {
        const pg = doc.addPage([300, 300]);
        const noise = Array.from({ length: 20 * 1024 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256).toString(16).padStart(2, "0")).join("");
        pg.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream(`% ${noise}\n0 0 10 10 re f`)));
      }
      return { name: "heavy.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save({ useObjectStreams: false })) };
    })();
    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles(heavy);
    await page.getByRole("radio", { name: "By file size" }).check({ force: true });
    await page.getByLabel("Largest file size").fill("0.1");
    await page.getByRole("button", { name: "Split PDF", exact: true }).click();
    await expect(page.getByText(/^Created \d+ files\.$/)).toBeVisible();
    const zip = await download(page, /Download all/);
    const entries = Object.values(unzipSync(new Uint8Array(zip.bytes)));
    expect(entries.length).toBeGreaterThan(2);
    for (const e of entries) expect(e.length).toBeLessThanOrEqual(0.1 * 1024 * 1024);
  });

  test("has no WCAG A/AA violations with the page grid", async ({ page }) => {
    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles(await file("report.pdf", 1, 4));
    await expect(page.getByText("Makes 2 files.")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
  });
});
