/** Data-format conversions: JSON ⇄ YAML ⇄ CSV/TSV. */

import yaml from "js-yaml";
import Papa from "papaparse";
import { JsonSyntaxError, parseJson } from "./json";

export class ConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvertError";
  }
}

export function jsonToYaml(text: string, options: { indent?: number; sortKeys?: boolean } = {}): string {
  const parsed = parseJson(text);
  if (!parsed.ok) throw new JsonSyntaxError(parsed.error);
  return yaml.dump(parsed.value, { indent: options.indent ?? 2, sortKeys: options.sortKeys ?? false, lineWidth: -1, noRefs: true });
}

export function yamlToJson(text: string, indent: number | "tab" = 2): string {
  try {
    const value = yaml.load(text);
    return JSON.stringify(value === undefined ? null : value, null, indent === "tab" ? "\t" : indent);
  } catch (err) {
    throw new ConvertError(err instanceof Error ? err.message.split("\n")[0] ?? "Invalid YAML" : "Invalid YAML");
  }
}

/** Flatten nested objects into dotted keys: `{a:{b:1}}` → `{"a.b":1}`. */
export function flattenObject(input: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (input === null || typeof input !== "object") {
    out[prefix] = input;
    return out;
  }
  if (Array.isArray(input)) {
    if (input.length === 0) out[prefix] = "[]";
    input.forEach((v, i) => flattenObject(v, prefix ? `${prefix}.${i}` : String(i), out));
    return out;
  }
  const entries = Object.entries(input as object);
  if (entries.length === 0 && prefix) out[prefix] = "{}";
  for (const [k, v] of entries) flattenObject(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Inverse of {@link flattenObject}. Numeric path segments create arrays. */
export function unflattenObject(flat: Record<string, unknown>): unknown {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split(".");
    let node: Record<string, unknown> = root;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        node[key] = value;
        return;
      }
      if (node[key] === undefined || node[key] === null || typeof node[key] !== "object") node[key] = {};
      node = node[key] as Record<string, unknown>;
    });
  }
  const arrayify = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    const converted = Object.fromEntries(keys.map((k) => [k, arrayify(obj[k])]));
    if (keys.length > 0 && keys.every((k, i) => k === String(i))) return keys.map((k) => converted[k]);
    return converted;
  };
  return arrayify(root);
}

export type Delimiter = "," | "\t" | ";" | "|";

export interface JsonToCsvOptions {
  delimiter?: Delimiter;
  flatten?: boolean;
  header?: boolean;
}

export function jsonToCsv(text: string, options: JsonToCsvOptions = {}): string {
  const { delimiter = ",", flatten = true, header = true } = options;
  const parsed = parseJson(text);
  if (!parsed.ok) throw new JsonSyntaxError(parsed.error);
  const rows = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
  const objects = rows.map((row): Record<string, unknown> => {
    if (row !== null && typeof row === "object" && !Array.isArray(row)) return flatten ? flattenObject(row) : (row as Record<string, unknown>);
    return { value: row as unknown };
  });
  const columns: string[] = [];
  for (const obj of objects) for (const key of Object.keys(obj)) if (!columns.includes(key)) columns.push(key);
  const data = objects.map((obj) =>
    columns.map((c) => {
      const v = obj[c];
      if (v === undefined || v === null) return "";
      return typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
    }),
  );
  return Papa.unparse({ fields: header ? columns : [], data }, { delimiter, newline: "\n", header });
}

export interface CsvToJsonOptions {
  delimiter?: Delimiter | "auto";
  header?: boolean;
  /** Convert numeric/boolean/null-looking fields to JSON types. */
  typed?: boolean;
  /** Rebuild nested objects from dotted headers. */
  unflatten?: boolean;
  indent?: number | "tab";
}

export function csvToJson(text: string, options: CsvToJsonOptions = {}): string {
  const { delimiter = "auto", header = true, typed = true, unflatten = false, indent = 2 } = options;
  const result = Papa.parse<Record<string, unknown> | unknown[]>(text.trim(), {
    header,
    delimiter: delimiter === "auto" ? "" : delimiter,
    skipEmptyLines: "greedy",
    dynamicTyping: typed,
  });
  const fatal = result.errors.find((e) => e.type !== "FieldMismatch" && e.code !== "UndetectableDelimiter");
  if (fatal) throw new ConvertError(`${fatal.message}${fatal.row !== undefined ? ` (row ${fatal.row + 1})` : ""}`);
  let data: unknown = result.data;
  if (header && unflatten) data = (result.data as Record<string, unknown>[]).map((row) => unflattenObject(row));
  return JSON.stringify(data, null, indent === "tab" ? "\t" : indent);
}

/** Re-delimit CSV text, e.g. CSV → TSV. */
export function convertDelimiter(text: string, from: Delimiter | "auto", to: Delimiter): string {
  const parsed = Papa.parse<string[]>(text.trim(), { delimiter: from === "auto" ? "" : from, skipEmptyLines: "greedy" });
  return Papa.unparse(parsed.data, { delimiter: to, newline: "\n" });
}

/** Render rows as a Markdown table. */
export function csvToMarkdownTable(text: string, delimiter: Delimiter | "auto" = "auto"): string {
  const parsed = Papa.parse<string[]>(text.trim(), { delimiter: delimiter === "auto" ? "" : delimiter, skipEmptyLines: "greedy" });
  const rows = parsed.data;
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const cell = (v: string | undefined) => (v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => cell(r[i]));
  const [head, ...body] = rows as [string[], ...string[][]];
  const lines = [`| ${pad(head).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...body.map((r) => `| ${pad(r).join(" | ")} |`)];
  return lines.join("\n");
}
