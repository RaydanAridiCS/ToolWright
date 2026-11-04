import { expect, test } from "@playwright/test";
import { makePng, trackRequests } from "./helpers";

function isApng(bytes: Buffer): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || !signature.every((b, i) => bytes[i] === b)) return false;
  // Find the acTL chunk ( Animated PNG control chunk ).
  const acTL = Buffer.from("acTL");
  for (let i = 8; i < bytes.length - 4; i++) {
    if (bytes[i] === acTL[0] && bytes[i + 1] === acTL[1] && bytes[i + 2] === acTL[2] && bytes[i + 3] === acTL[3]) {
      return true;
    }
  }
  return false;
}

test.describe("APNG Maker", () => {
  test("combines PNG frames into an animated PNG without uploading", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    const violations: string[] = [];
    page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));

    await page.goto("/tools/apng-maker");
    const frames = [await makePng(page, 40, 40), await makePng(page, 40, 40), await makePng(page, 40, 40)];
    await page.locator('input[type="file"]').setInputFiles(
      frames.map((buffer, i) => ({ name: `frame-${i + 1}.png`, mimeType: "image/png", buffer })),
    );
    await expect(page.getByText("frame-1.png")).toBeVisible();

    await page.getByRole("button", { name: "Create APNG from 3 frames" }).click();
    await expect(page.getByText("Done! Your file is ready.")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toBe("animation.png");
    const bytes = await download.path().then((p) => import("node:fs/promises").then(({ readFile }) => readFile(p!)));
    expect(isApng(bytes)).toBe(true);

    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.all.filter((r) => r.method() !== "GET" && !r.url().includes("/_next/"))).toEqual([]);
    expect(violations).toEqual([]);
  });

  test("refuses a single frame", async ({ page }) => {
    await page.goto("/tools/apng-maker");
    const png = await makePng(page, 40, 40);
    await page.locator('input[type="file"]').setInputFiles({ name: "frame-1.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("button", { name: "Create APNG from 1 frames" })).toBeDisabled();
    await expect(page.getByText("Add at least one more frame.")).toBeVisible();
  });

  test("rejects a non-PNG file", async ({ page }) => {
    await page.goto("/tools/apng-maker");
    await page.locator('input[type="file"]').setInputFiles({ name: "frame.txt", mimeType: "text/plain", buffer: Buffer.from("not a png") });
    await expect(page.getByText("frame.txt is not a supported file type")).toBeVisible();
  });
});
