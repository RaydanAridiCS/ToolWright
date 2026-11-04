import { describe, expect, it } from "vitest";
import { tomlToJson, validateToml } from "../src/toml-validator";

describe("validateToml", () => {
  it("validates a simple key-value document", () => {
    const result = validateToml('title = "Hello"');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ title: "Hello" });
  });

  it("validates tables and arrays", () => {
    const input = `[server]\nhost = "localhost"\nport = 8080\n\n[database]\nenabled = true\nports = [8000, 8001]`;
    const result = validateToml(input);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({
      server: { host: "localhost", port: 8080 },
      database: { enabled: true, ports: [8000, 8001] },
    });
  });

  it("rejects empty input", () => {
    const result = validateToml("");
    expect(result.valid).toBe(false);
    expect(result.error?.message).toMatch(/cannot be empty/i);
  });

  it("rejects whitespace-only input", () => {
    const result = validateToml("   \n\t  ");
    expect(result.valid).toBe(false);
  });

  it("reports a syntax error with line and column", () => {
    const result = validateToml("name = \"ok\"\nport = \"not a number");
    expect(result.valid).toBe(false);
    expect(result.error?.line).toBeGreaterThanOrEqual(1);
    expect(result.error?.message).toBeTruthy();
  });

  it("rejects a duplicate key", () => {
    const result = validateToml("name = \"a\"\nname = \"b\"");
    expect(result.valid).toBe(false);
  });
});

describe("tomlToJson", () => {
  it("converts valid TOML to JSON", () => {
    const json = tomlToJson('title = "TOML Example"');
    expect(JSON.parse(json)).toEqual({ title: "TOML Example" });
  });

  it("throws a readable error for invalid TOML", () => {
    expect(() => tomlToJson("name = ")).toThrow(/line/i);
  });

  it("uses custom indentation", () => {
    const json = tomlToJson("[a]\nb = 1", { indent: 4 });
    expect(json).toContain("    \"b\":");
  });

  it("handles dates and big integers", () => {
    const json = tomlToJson('dob = 1979-05-27T07:32:00Z\nbig = 9223372036854775807');
    const parsed = JSON.parse(json);
    expect(parsed.dob).toMatch(/^1979-05-27T07:32:00/);
    expect(typeof parsed.big).toBe("string");
    expect(parsed.big).toBe("9223372036854775807");
  });
});
