import { describe, expect, it } from "vitest";
import { PDF417_MAX_LENGTH, validatePdf417Input } from "../src/pdf417-generator";

describe("validatePdf417Input", () => {
  it("accepts non-empty text", () => {
    expect(validatePdf417Input("Hello")).toEqual({ valid: true });
  });

  it("rejects empty input", () => {
    expect(validatePdf417Input("").valid).toBe(false);
    expect(validatePdf417Input("   ").valid).toBe(false);
  });

  it("rejects input that exceeds the maximum length", () => {
    const text = "a".repeat(PDF417_MAX_LENGTH + 1);
    const result = validatePdf417Input(text);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("1850");
  });
});
