import { expect, test } from "@playwright/test";

test.describe("GraphQL Query Validator", () => {
  test("validates syntax without a schema", async ({ page }) => {
    await page.goto("/tools/graphql-validator");
    await expect(page.getByRole("heading", { name: "GraphQL Query Validator", exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "GraphQL query", exact: true }).fill("{ hello }");
    await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  });

  test("reports a syntax error", async ({ page }) => {
    await page.goto("/tools/graphql-validator");
    await page.getByRole("textbox", { name: "GraphQL query", exact: true }).fill("{ hello(");
    await expect(page.getByText(/Validation failed/i)).toBeVisible();
  });

  test("validates a query against the sample schema", async ({ page }) => {
    await page.goto("/tools/graphql-validator");
    await page.getByRole("button", { name: "Load sample" }).click();
    await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  });

  test("reports a schema mismatch", async ({ page }) => {
    await page.goto("/tools/graphql-validator");
    const query = page.getByRole("textbox", { name: "GraphQL query", exact: true });
    const schema = page.getByRole("textbox", { name: "Schema (optional)", exact: true });
    await query.fill("{ missingField }");
    await schema.fill("type Query { hello: String }");
    await expect(page.getByText(/Validation failed/i)).toBeVisible();
    await expect(page.getByText(/Cannot query field/i)).toBeVisible();
  });
});
