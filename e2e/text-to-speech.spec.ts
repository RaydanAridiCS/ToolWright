import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function scan(page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.describe("Text-to-Speech", () => {
  test("renders controls and reflects state in the URL", async ({ page }) => {
    await page.goto("/tools/text-to-speech");
    await expect(page.getByRole("heading", { name: "Text-to-Speech", exact: true })).toBeVisible();

    const textarea = page.getByRole("textbox", { name: "Text to speak", exact: true });
    await textarea.fill("Hello from Toolwright.");

    // The "Speak" button should be enabled once there is text and voices have loaded.
    const speak = page.getByRole("button", { name: /Speak|Restart/ });
    await expect(speak).toBeEnabled();

    // Options are mirrored into the URL hash.
    await expect.poll(() => page.url()).toContain("#s=");
  });

  test("loads the sample text and keeps the page accessible", async ({ page }) => {
    await page.goto("/tools/text-to-speech");
    await page.getByRole("button", { name: "Sample" }).click();
    await expect(page.getByRole("textbox", { name: "Text to speak", exact: true })).toHaveValue(/The quick brown fox/);
    expect(await scan(page)).toEqual([]);
  });
});
