import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("shows the headline, the toolbox ledger and the drawers", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Toolwright/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Do the job\.\s*Keep the data\./);
    await expect(page.getByRole("heading", { name: "The toolbox" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Drawers" })).toBeVisible();
    await expect(page.getByRole("link", { name: /JSON Formatter/ }).first()).toBeVisible();
  });

  test("has no eyebrow chip above the headline and no gradient, glow or blur anywhere on the page", async ({ page }) => {
    await page.goto("/");
    // Nothing but layout sits between the header and the headline.
    const above = await page.evaluate(() => {
      const h1 = document.querySelector("h1")!;
      const hero = h1.closest("section")!;
      return Array.from(hero.querySelectorAll("*")).filter((el) => (el.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && !el.contains(h1) && (el.textContent ?? "").trim() !== "").map((el) => el.tagName);
    });
    expect(above).toEqual([]);
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*")).flatMap((el) => {
        const cs = getComputedStyle(el);
        const bad: string[] = [];
        if (cs.backgroundImage.includes("gradient")) bad.push("gradient");
        if (cs.backdropFilter !== "none" && cs.backdropFilter !== "") bad.push("backdrop-filter");
        if (cs.filter.includes("blur")) bad.push("blur");
        return bad.map((b) => `${el.tagName}.${(el as HTMLElement).className}: ${b}`);
      }),
    );
    expect(offenders).toEqual([]);
  });

  test("the bench is a working tool: it formats, switches tabs and hashes locally", async ({ page }) => {
    await page.goto("/");
    const input = page.getByLabel("Input", { exact: true });
    const result = page.getByRole("group", { name: "Result" });
    await expect(result).toContainText('"private": true');
    await input.fill('{"a":[1,2]}');
    await expect(result).toContainText('"a": [');
    await page.getByText("Hash", { exact: true }).click();
    await expect(result).toContainText("2ab96390c7dbe3439de74d0c9b0b1767");
    await expect(result).toContainText("f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7");
  });

  test("the network ledger reads 0 outside requests, in the hero bench and the footer", async ({ page }) => {
    await page.goto("/");
    const readouts = page.getByTestId("outside-requests");
    await expect(readouts.first()).toHaveText("0");
    expect(await readouts.count()).toBeGreaterThanOrEqual(2);
    for (const readout of await readouts.all()) await expect(readout).toHaveText("0");
  });

  test("'Try to make it leak' shows the browser refusing, and the counter stays at zero", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Try to make it leak" }).click();
    await expect(page.getByText("Blocked.")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Nothing left your device." })).toContainText("connect-src");
    await expect(page.getByTestId("outside-requests").first()).toHaveText("0");
  });

  test("the request log lists this page's real files", async ({ page }) => {
    await page.goto("/");
    const log = page.getByRole("region", { name: "Requests made by this page" });
    await expect(log.getByText("this site").first()).toBeVisible();
    await expect(log.getByText("outside")).toHaveCount(0);
  });

  test("the ticket carries your idea to the request board", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("What should we build?").fill("Compare two JSON files");
    await page.getByRole("button", { name: "Add to the board" }).click();
    await expect(page).toHaveURL(/\/requests\?title=Compare%20two%20JSON%20files$/);
    await expect(page.getByLabel("What should we build?")).toHaveValue("Compare two JSON files");
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
  test("cycles light → dark → system and remembers the choice", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    const toggle = page.getByRole("button", { name: /theme/i });
    await toggle.click(); // → dark
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await toggle.click(); // → system (the OS is light here)
    await expect(toggle).toHaveAccessibleName(/Match system theme/);
    await expect(html).not.toHaveClass(/dark/);
  });

  test("first-time visitors get light paper even when their OS prefers dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(244, 240, 230)"); // paper #f4f0e6
  });

  test("'match system' follows the OS, with no flash of the wrong theme", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tw-theme", "system"));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(18, 17, 13)"); // ink #12110d
  });
});

test.describe("static pages", () => {
  for (const [path, heading] of [
    ["/privacy", "How privacy works"],
    ["/about", "About Toolwright"],
    ["/contribute", "Contribute"],
    ["/tools", /^All \d+ tools$/],
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
