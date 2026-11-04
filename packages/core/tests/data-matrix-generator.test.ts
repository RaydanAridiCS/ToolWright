import { describe, expect, it } from "vitest";
import { DATA_MATRIX_MAX_LENGTH, validateDataMatrixInput } from "../src/data-matrix-generator";

describe("validateDataMatrixInput", () => {
  it("accepts non-empty text", () => {
    expect(validateDataMatrixInput("Hello")).toEqual({ valid: true });
  });

  it("rejects empty input", () => {
    expect(validateDataMatrixInput("").valid).toBe(false);
    expect(validateDataMatrixInput("   ").valid).toBe(false);
  });

  it("rejects input that exceeds the maximum length", () => {
    const text = "a".repeat(DATA_MATRIX_MAX_LENGTH + 1);
    const result = validateDataMatrixInput(text);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("3116");
  });
});
