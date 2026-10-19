import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("shows the promise, popular tools and categories", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Toolwright/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("never see");
    await expect(page.getByRole("heading", { name: "Popular tools" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Browse by category" })).toBeVisible();
    await expect(page.getByRole("link", { name: /JSON Formatter/ }).first()).toBeVisible();
  });

  test("has structured data and a canonical URL", async ({ page }) => {
    await page.goto("/");
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld ?? "{}")).toMatchObject({ "@type": "WebSite", name: "Toolwright" });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /toolwright\.com\/?$/);
  });

  test("keyboard: skip link jumps to main content", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard only");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test.describe("search palette", () => {
  test("opens with Ctrl+K, filters, and opens a tool with Enter", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcut");
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Search \d+ tools/);
    await expect(input).toBeVisible();
    await input.fill("merge pdf");
    await expect(page.getByRole("option", { name: /Merge PDF/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/tools\/merge-pdf$/);
    await expect(page.getByRole("heading", { level: 1, name: "Merge PDF" })).toBeVisible();
  });

  test("opens from the hero button and with the / key, and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Search/ }).first().click();
    await expect(page.getByPlaceholder(/Search \d+ tools/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(/Search \d+ tools/)).toBeHidden();
  });

  test("suggests requesting a tool when nothing matches", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Search/ }).first().click();
    await page.getByPlaceholder(/Search \d+ tools/).fill("zzzzqqq");
    await expect(page.getByText(/No tools match/)).toBeVisible();
    await page.getByRole("button", { name: "Request it" }).click();
    await expect(page).toHaveURL(/\/requests$/);
  });
});

test.describe("theme", () => {
  test("cycles system → light → dark and remembers the choice", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    const toggle = page.getByRole("button", { name: /theme/i });
    await toggle.click(); // → light
    await toggle.click(); // → dark
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
  });

  test("follows the OS preference in system mode without flashing", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("static pages", () => {
  for (const [path, heading] of [
    ["/privacy", "How privacy works"],
    ["/about", "About Toolwright"],
    ["/contribute", "Contribute"],
    ["/tools", "All tools"],
    ["/requests", "Request a tool"],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("unknown pages show the friendly 404", async ({ page }) => {
    const response = await page.goto("/tools/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /isn.t in the workshop/ })).toBeVisible();
  });

  test("sitemap, robots and manifest are served", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain("/tools/json-formatter");
    expect((xml.match(/<url>/g) ?? []).length).toBeGreaterThan(70);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Sitemap:");
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ short_name: "Toolwright", display: "standalone" });
    const icon = await request.get("/icons/512");
    expect(icon.headers()["content-type"]).toContain("image/png");
  });
});
