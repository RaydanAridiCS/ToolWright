import { readFile } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { trackRequests } from "./helpers";

const FIXTURES = join(__dirname, "..", "packages", "core", "tests", "fixtures", "pdf", "encrypted");
const fixture = async (name: string) => ({ name: `${name}.pdf`, mimeType: "application/pdf", buffer: await readFile(join(FIXTURES, `${name}.pdf`)) });

const PASSWORD = "Canary-Pw-7731";

async function download(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

test.describe("Protect PDF and Unlock PDF in a real browser", () => {
  test("protects with a password, unlocks again, and the password never leaves the page", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/protect-pdf");
    await page.locator('input[type="file"]').setInputFiles(await fixture("plain"));
    await page.getByLabel("Password to open the PDF", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Protect PDF", exact: true }).click();
    const locked = await download(page);
    expect(locked.name).toBe("plain-protected.pdf");
    await expect(PDFDocument.load(locked.bytes)).rejects.toThrow(/encrypted/i);
    expect(locked.bytes.toString("latin1")).not.toContain("Quarterly secret report");

    await page.goto("/tools/unlock-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: locked.name, mimeType: "application/pdf", buffer: locked.bytes });
    await expect(page.getByText("AES-256 · needs a password")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("wrong one");
    await page.getByRole("button", { name: "Unlock PDF", exact: true }).click();
    await expect(page.getByText(/does not open this PDF/)).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Unlock PDF", exact: true }).click();
    const open = await download(page);
    expect(open.name).toBe("plain-protected-unlocked.pdf");
    const doc = await PDFDocument.load(open.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe("Quarterly secret report");

    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.containing(PASSWORD)).toEqual([]);
    expect(page.url()).not.toContain(PASSWORD);
  });

  test("restricts printing with a random owner password, and Unlock lifts it without asking", async ({ page }) => {
    await page.goto("/tools/protect-pdf");
    await page.locator('input[type="file"]').setInputFiles(await fixture("plain"));
    await page.getByRole("switch", { name: "Restrict printing, copying or editing" }).check();
    await page.getByRole("switch", { name: "Allow printing" }).uncheck();
    await page.getByRole("button", { name: "Protect PDF", exact: true }).click();
    await expect(page.getByTestId("owner-password")).toHaveText(/^[A-Za-z2-9]{20}$/);
    const restricted = await download(page);

    await page.goto("/tools/unlock-pdf");
    await page.locator('input[type="file"]').setInputFiles({ name: "restricted.pdf", mimeType: "application/pdf", buffer: restricted.bytes });
    await expect(page.getByText("AES-256 · blocks printing")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Unlock PDF", exact: true }).click();
    expect((await PDFDocument.load((await download(page)).bytes)).getPageCount()).toBe(2);
  });

  test("unlocks files made by other software, in a batch", async ({ page }) => {
    await page.goto("/tools/unlock-pdf");
    await page.locator('input[type="file"]').setInputFiles([await fixture("rc4-128"), await fixture("owner-only"), await fixture("plain")]);
    await expect(page.getByText("RC4 128-bit · needs a password")).toBeVisible();
    await expect(page.getByText("AES-128 · blocks printing, copying")).toBeVisible();
    await expect(page.getByText(/plain\.pdf has no password or restrictions/)).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("user128");
    await page.getByRole("button", { name: "Unlock 2 PDFs" }).click();
    const zip = await download(page);
    expect(zip.name).toBe("unlocked-pdfs.zip");
  });

  test("any PDF tool asks for the password of a protected file, then carries on", async ({ page, baseURL }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/rotate-pdf");
    await page.locator('input[type="file"]').setInputFiles(await fixture("aes-256"));
    const prompt = page.getByRole("group", { name: "Password for aes-256.pdf" });
    await expect(prompt).toBeVisible();
    await prompt.getByLabel("PDF password", { exact: true }).fill("nope");
    await prompt.getByRole("button", { name: "Open PDF" }).click();
    await expect(prompt.getByText("That password does not open this PDF.")).toBeVisible();
    await prompt.getByLabel("PDF password", { exact: true }).fill("owner256");
    await prompt.getByRole("button", { name: "Open PDF" }).click();
    await expect(page.getByText("2 of 2 pages will turn")).toBeVisible();
    await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
    const rotated = await download(page);
    expect((await PDFDocument.load(rotated.bytes)).getPages().map((p) => p.getRotation().angle)).toEqual([90, 90]);
    expect(tracker.external(baseURL!)).toEqual([]);
    expect(tracker.containing("owner256")).toEqual([]);
  });

  test("Merge PDF and Compress PDF open protected files too", async ({ page }) => {
    await page.goto("/tools/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([await fixture("plain"), await fixture("aes-128")]);
    const prompt = page.getByRole("group", { name: "Password for aes-128.pdf" });
    await prompt.getByLabel("PDF password", { exact: true }).fill("useraes");
    await prompt.getByRole("button", { name: "Open PDF" }).click();
    await page.getByRole("button", { name: /^Merge 2 PDFs \(4 pages\)/ }).click();
    expect((await PDFDocument.load((await download(page)).bytes)).getPageCount()).toBe(4);

    await page.goto("/tools/compress-pdf");
    await page.locator('input[type="file"]').setInputFiles(await fixture("rc4-40"));
    const compressPrompt = page.getByRole("group", { name: "Password for rc4-40.pdf" });
    await compressPrompt.getByLabel("PDF password", { exact: true }).fill("owner40");
    await compressPrompt.getByRole("button", { name: "Open PDF" }).click();
    await expect(compressPrompt).toHaveCount(0);
    await expect(page.getByText("rc4-40.pdf")).toBeVisible();
  });

  test("a file that only restricts printing opens in other tools without a prompt", async ({ page }) => {
    await page.goto("/tools/pdf-page-numbers");
    await page.locator('input[type="file"]').setInputFiles(await fixture("owner-only"));
    await expect(page.getByRole("button", { name: "Add page numbers" })).toBeVisible();
    await expect(page.getByLabel("PDF password", { exact: true })).toHaveCount(0);
  });

  test("has no WCAG A/AA violations with the options and the prompt open", async ({ page }) => {
    await page.goto("/tools/protect-pdf");
    await page.locator('input[type="file"]').setInputFiles(await fixture("plain"));
    await page.getByRole("switch", { name: "Restrict printing, copying or editing" }).check();
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

    await page.goto("/tools/split-pdf");
    await page.locator('input[type="file"]').setInputFiles(await fixture("aes-128"));
    await expect(page.getByLabel("PDF password", { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
});
