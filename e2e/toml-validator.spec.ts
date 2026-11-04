import { expect, test } from "@playwright/test";

test.describe("TOML Validator", () => {
  test("validates TOML and converts it to JSON", async ({ page }) => {
    await page.goto("/tools/toml-validator");
    await expect(page.getByRole("heading", { name: "TOML Validator", exact: true })).toBeVisible();

    const input = page.getByRole("textbox", { name: "TOML", exact: true });
    await input.fill("title = \"Hello\"\n[count]\nvalue = 42");

    await expect(page.getByText("Valid TOML")).toBeVisible();
    const output = page.getByRole("textbox", { name: "JSON", exact: true });
    await expect(output).toHaveValue(/"title":\s*"Hello"/);
    await expect(output).toHaveValue(/"count":\s*{\s*"value":\s*42\s*}/);
  });

  test("shows an error for invalid TOML", async ({ page }) => {
    await page.goto("/tools/toml-validator");
    await page.getByRole("textbox", { name: "TOML", exact: true }).fill("title = \"missing quote");
    await expect(page.getByText(/Invalid TOML/i)).toBeVisible();
  });

  test("loads the sample", async ({ page }) => {
    await page.goto("/tools/toml-validator");
    await page.getByRole("button", { name: "Sample" }).click();
    await expect(page.getByRole("textbox", { name: "TOML", exact: true })).toHaveValue(/\[package\]/);
  });
});
