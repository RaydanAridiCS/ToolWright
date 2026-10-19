import { expect, test } from "@playwright/test";

test.describe("offline support", () => {
  test("a tool you have opened keeps working without a network", async ({ page, context }) => {
    await page.goto("/tools/base64-encoder");
    await page.getByLabel("Input", { exact: true }).fill("online");
    await expect(page.getByLabel("Output")).toHaveValue("b25saW5l");

    // Wait for the service worker to take control and finish caching what the page used.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Base64 Encode & Decode" })).toBeVisible();
    await page.getByLabel("Input", { exact: true }).fill("offline");
    await expect(page.getByLabel("Output")).toHaveValue("b2ZmbGluZQ==");
    await context.setOffline(false);
  });

  test("pages that were never opened fall back to the offline page", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.goto("/tools/hash-generator").catch(() => {});
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
    await context.setOffline(false);
  });
});
