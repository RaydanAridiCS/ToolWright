/** Logic for the TOML Validator & Converter tool. Keep this file free of React, the DOM and the network. */

import { parse } from "@ltd/j-toml";

export interface TomlValidationError {
  message: string;
  line?: number;
  column?: number;
}

export interface TomlValidationResult {
  valid: boolean;
  value?: unknown;
  error?: TomlValidationError;
}

export interface TomlToJsonOptions {
  /** Spaces per level, or "tab". Default 2. */
  indent?: number | "tab";
}

/**
 * Parse and validate a TOML document.
 * Returns the parsed value on success, or a readable error with line and column when possible.
 */
export function validateToml(input: string): TomlValidationResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { valid: false, error: { message: "TOML cannot be empty. Paste a document to validate it." } };
  }

  try {
    const value = parse(trimmed, 1.0, undefined, Number.MAX_SAFE_INTEGER);
    return { valid: true, value };
  } catch (error) {
    return { valid: false, error: parseTomlError(error) };
  }
}

/**
 * Convert a TOML document to formatted JSON.
 * Throws a readable `Error` if the TOML is invalid.
 */
export function tomlToJson(input: string, options: TomlToJsonOptions = {}): string {
  const result = validateToml(input);
  if (!result.valid) {
    const e = result.error!;
    const location = e.line ? `Line ${e.line}${e.column ? `, column ${e.column}` : ""}: ` : "";
    throw new Error(`${location}${e.message}`);
  }

  const unit = options.indent === "tab" ? "\t" : " ".repeat(options.indent ?? 2);
  return JSON.stringify(result.value, replacer, unit) + "\n";
}

/** JSON replacer that keeps Date and BigInt values readable. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
}

function parseTomlError(error: unknown): TomlValidationError {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const message = error.message;

  // j-toml errors often look like: "line 3, column 5: ..." or include "Line N, column M".
  const match = /line\s+(\d+)(?:\s*,\s*column\s+(\d+))?/i.exec(message);
  if (match) {
    const line = Number(match[1]);
    const column = match[2] ? Number(match[2]) : undefined;
    const clean = message.replace(/^(?:Error:\s*)?line\s+\d+(?:\s*,\s*column\s+\d+)?[:\s]*/i, "").trim();
    return { message: clean || message, line, column };
  }

  return { message };
}
