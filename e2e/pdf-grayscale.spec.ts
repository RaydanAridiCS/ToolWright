import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { trackRequests } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** A colourful page: shapes, red text, and a PNG and a JPEG photo made by the browser's canvas. */
async function colourful(page: Page, name: string) {
  const images = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 120, 0);
    grad.addColorStop(0, "#e11d48");
    grad.addColorStop(0.5, "#16a34a");
    grad.addColorStop(1, "#2563eb");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 120, 80);
    const toBytes = async (type: string) => Array.from(new Uint8Array(await (await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), type, 0.9))).arrayBuffer()));
    return { png: await toBytes("image/png"), jpeg: await toBytes("image/jpeg") };
  });
  const doc = await PDFDocument.create();
  const p = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  p.drawRectangle({ x: 20, y: 300, width: 160, height: 80, color: rgb(0.9, 0.1, 0.1) });
  p.drawRectangle({ x: 220, y: 300, width: 160, height: 80, color: rgb(0.1, 0.3, 0.9), borderColor: rgb(0, 0.8, 0), borderWidth: 6 });
  p.drawText("Colour report", { x: 20, y: 260, size: 24, font, color: rgb(0.8, 0, 0.4) });
  p.drawImage(await doc.embedPng(Uint8Array.from(images.png)), { x: 20, y: 40, width: 160, height: 107 });
  p.drawImage(await doc.embedJpg(Uint8Array.from(images.jpeg)), { x: 220, y: 40, width: 160, height: 107 });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

/**
 * The largest gap between the red, green and blue of any pixel in an image on the page (0 means fully gray). The rows
 * of the heading are left out: the browser smooths text with coloured sub-pixel fringes in the preview picture.
 */
async function colourIn(page: Page, alt: string): Promise<number> {
  return page.getByRole("img", { name: alt }).evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // The heading sits between 255 and 285 points up a 400-point page.
    const top = Math.floor(((400 - 290) / 400) * canvas.height);
    const bottom = Math.ceil(((400 - 250) / 400) * canvas.height);
    let most = 0;
    for (let y = 0; y < canvas.height; y++) {
      if (y >= top && y <= bottom) continue;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        most = Math.max(most, Math.abs(data[i]! - data[i + 1]!), Math.abs(data[i + 1]! - data[i + 2]!), Math.abs(data[i]! - data[i + 2]!));
      }
    }
    return most;
  });
}

test.describe("Grayscale PDF", () => {
  test("turns every colour gray, photos included, without any request elsewhere", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/grayscale-pdf");
    await page.locator('input[type="file"]').setInputFiles(await colourful(page, "report.pdf"));
    await page.getByRole("button", { name: "Convert to grayscale" }).click();
    await expect(page.getByText(/^Changed \d+ colour settings, 2 pictures and 0 colour blends.$/)).toBeVisible();
    await expect(page.getByRole("img", { name: "Page 1, after" })).toBeVisible();
    expect(await colourIn(page, "Page 1, before")).toBeGreaterThan(100);
    // JPEG rounding can leave a trace of one or two levels; that is gray to the eye.
    expect(await colourIn(page, "Page 1, after")).toBeLessThanOrEqual(4);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("report-grayscale.pdf");
    expect(tracker.external(baseURL!)).toEqual([]);
  });

  test("makes black and white", async ({ page }) => {
    await page.goto("/tools/grayscale-pdf");
    await page.locator('input[type="file"]').setInputFiles(await colourful(page, "flyer.pdf"));
    await page.getByRole("radio", { name: "Black and white" }).check({ force: true });
    await page.getByLabel("Lighter than this turns white").fill("60");
    await page.getByRole("button", { name: "Convert to black and white" }).click();
    await expect(page.getByRole("img", { name: "Page 1, after" })).toBeVisible();
    expect(await colourIn(page, "Page 1, after")).toBeLessThanOrEqual(1);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("flyer-black-white.pdf");
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/tools/grayscale-pdf");
    await page.locator('input[type="file"]').setInputFiles(await colourful(page, "report.pdf"));
    await page.getByRole("button", { name: "Convert to grayscale" }).click();
    await expect(page.getByRole("img", { name: "Page 1, after" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});
