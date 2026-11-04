import { describe, expect, it } from "vitest";
import { draftFromUri, validateJsonAgainstSchema } from "../src/json-schema-validator";

const OK = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "integer", minimum: 0, maximum: 130 },
    email: { type: "string", format: "email" },
    tags: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} as const;

const asText = (value: unknown) => JSON.stringify(value, null, 2);

describe("validateJsonAgainstSchema", () => {
  it("accepts a document that matches", () => {
    const result = validateJsonAgainstSchema(asText({ name: "Ada", age: 36, email: "ada@example.com", tags: ["math"] }), asText(OK));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("reports the violated keyword with a friendly path", () => {
    const result = validateJsonAgainstSchema(asText({ name: "Ada", age: 200 }), asText(OK));
    expect(result.valid).toBe(false);
    const maximum = result.issues.find((issue) => issue.keyword === "maximum");
    expect(maximum?.path).toBe("age");
    expect(maximum?.message).toContain("greater than 130");
    // The parent wrapper line ("Property age does not match schema") must not duplicate the child.
    expect(result.issues.some((issue) => issue.message.includes("does not match schema"))).toBe(false);
  });

  it("reports missing required keys", () => {
    const result = validateJsonAgainstSchema(asText({ age: 4 }), asText(OK));
    const required = result.issues.find((issue) => issue.keyword === "required");
    expect(required?.path).toBe("(root)");
    expect(required?.message).toContain("name");
  });

  it("rejects extra keys when additionalProperties is false", () => {
    const result = validateJsonAgainstSchema(asText({ name: "Ada", extra: 1 }), asText(OK));
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes("extra"))).toBe(true);
  });

  it("checks formats", () => {
    const result = validateJsonAgainstSchema(asText({ name: "Ada", email: "not-an-email" }), asText(OK));
    expect(result.issues.some((issue) => issue.keyword === "format")).toBe(true);
  });

  it("reports nested array items by index", () => {
    const result = validateJsonAgainstSchema(asText({ name: "Ada", tags: ["a", 3] }), asText(OK));
    expect(result.issues.some((issue) => issue.path === "tags[1]" && issue.keyword === "type")).toBe(true);
  });

  it("treats every wrong branch of anyOf as its own problem, without a wrapper summary", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", anyOf: [{ type: "string" }, { type: "integer" }] };
    const result = validateJsonAgainstSchema("true", asText(schema));
    expect(result.valid).toBe(false);
    const typeErrors = result.issues.filter((issue) => issue.keyword === "type");
    expect(typeErrors.length).toBe(2);
    expect(result.issues.some((issue) => issue.keyword === "anyOf")).toBe(false);
  });

  it("reports oneOf failures as the branch problems", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", oneOf: [{ type: "string" }, { type: "boolean" }] };
    const result = validateJsonAgainstSchema("5", asText(schema));
    expect(result.valid).toBe(false);
    expect(result.issues.filter((issue) => issue.keyword === "type").length).toBe(2);
  });

  it("escapes pointer tildes and slashes in paths", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { "a/b~c": { type: "string" } }, required: ["a/b~c"] };
    const result = validateJsonAgainstSchema(asText({ "a/b~c": 5 }), asText(schema));
    expect(result.issues[0]?.path).toBe('["a/b~c"]');
    expect(result.issues[0]?.pointer).toBe("#/a~1b~0c");
  });

  it("names the draft from the schema and overrides when asked", () => {
    const data = "5";
    const auto = validateJsonAgainstSchema(data, asText(OK), { draft: "auto" });
    expect(auto.draft).toBe("2020-12");
    const fixed = validateJsonAgainstSchema(data, asText({ type: "string" }), { draft: "draft-07" });
    expect(fixed.draft).toBe("draft-07");
    expect(fixed.valid).toBe(false);
  });

  it("reads draft-07 and draft-04 schemas", () => {
    expect(draftFromUri("http://json-schema.org/draft-07/schema#")).toBe("draft-07");
    expect(draftFromUri("https://json-schema.org/draft/2019-09/schema")).toBe("2019-09");
    expect(draftFromUri("https://example.com/unknown")).toBe(null);
  });

  it("marks an unstated draft as null under auto", () => {
    const result = validateJsonAgainstSchema("5", asText({ type: "string" }));
    expect(result.draft).toBe(null);
  });

  it("limits the report", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", required: [1, 2, 3, 4, 5, 6].map((n) => `k${n}`) };
    const data = {};
    const full = validateJsonAgainstSchema(asText(data), asText(schema), { limit: 50 });
    expect(full.total).toBe(6);
    expect(full.truncated).toBe(false);
    const short = validateJsonAgainstSchema(asText(data), asText(schema), { limit: 2 });
    expect(short.issues.length).toBe(2);
    expect(short.truncated).toBe(true);
  });

  it("throws a readable error for syntax problems on either side", () => {
    expect(() => validateJsonAgainstSchema("{bad", asText(OK))).toThrow(/line 1/);
    expect(() => validateJsonAgainstSchema("5", "{bad")).toThrow(/line 1/);
  });

  it("refuses to fetch remote $refs and explains why", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", $ref: "https://example.com/other.json" };
    const run = () => validateJsonAgainstSchema("5", asText(schema));
    expect(run).toThrow(/never leaves this tab/);
    expect(run).toThrow("$defs");
  });
});
