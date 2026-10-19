/** JSON formatting, validation and TypeScript type inference. */

export interface JsonError {
  message: string;
  line: number;
  column: number;
  position: number | null;
}

export type JsonParseResult<T = unknown> = { ok: true; value: T } | { ok: false; error: JsonError };

/** Convert a character offset into a 1-based line/column pair. */
export function positionToLineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, position));
  const lines = before.split("\n");
  return { line: lines.length, column: (lines[lines.length - 1] as string).length + 1 };
}

/**
 * Find the first syntax error in a JSON document. Engines word (and locate) errors differently,
 * so this small strict scanner gives the same answer everywhere.
 */
export function locateJsonError(text: string): { position: number; message: string } | null {
  const n = text.length;
  let i = 0;
  class Stop extends Error {
    constructor(
      readonly position: number,
      message: string,
    ) {
      super(message);
    }
  }
  const fail = (message: string, position = i): never => {
    throw new Stop(position, message);
  };
  const describe = (ch: string | undefined) => (ch === undefined ? "end of input" : `'${ch}'`);
  const ws = () => {
    while (i < n && " \t\n\r".includes(text[i] as string)) i++;
  };
  const string = () => {
    i++; // opening quote
    while (i < n) {
      const ch = text[i] as string;
      if (ch === '"') {
        i++;
        return;
      }
      if (ch < " ") fail("Control characters must be escaped inside strings");
      if (ch === "\\") {
        const next = text[i + 1];
        if (next === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail("Invalid \\u escape", i);
          i += 6;
        } else if (next !== undefined && '"\\/bfnrt'.includes(next)) i += 2;
        else fail(`Invalid escape sequence '\\${next ?? ""}'`, i);
      } else i++;
    }
    fail("Unterminated string", n);
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail("Invalid number");
    i += (m as RegExpExecArray)[0].length;
  };
  const value = (): void => {
    ws();
    const ch = text[i];
    if (ch === undefined) fail("Unexpected end of input");
    else if (ch === "{") {
      i++;
      ws();
      if (text[i] === "}") return void i++;
      for (;;) {
        ws();
        if (text[i] !== '"') fail(`Expected a property name in double quotes but found ${describe(text[i])}`);
        string();
        ws();
        if (text[i] !== ":") fail(`Expected ':' but found ${describe(text[i])}`);
        i++;
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "}") return void i++;
        else fail(`Expected ',' or '}' but found ${describe(text[i])}`);
      }
    } else if (ch === "[") {
      i++;
      ws();
      if (text[i] === "]") return void i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") return void i++;
        else fail(`Expected ',' or ']' but found ${describe(text[i])}`);
      }
    } else if (ch === '"') string();
    else if (ch === "-" || (ch >= "0" && ch <= "9")) number();
    else {
      const literal = ["true", "false", "null"].find((l) => text.startsWith(l, i));
      if (literal) i += literal.length;
      else fail(`Unexpected token ${describe(ch)}`);
    }
  };
  try {
    value();
    ws();
    if (i < n) fail(`Unexpected token ${describe(text[i])} after the end of the JSON value`);
    return null;
  } catch (err) {
    if (err instanceof Stop) return { position: err.position, message: err.message };
    throw err;
  }
}

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    const located = locateJsonError(text);
    if (located) {
      return { ok: false, error: { message: located.message, position: located.position, ...positionToLineColumn(text, located.position) } };
    }
    // The engine rejected something the scanner accepted; fall back to its message.
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err), line: 1, column: 1, position: null } };
  }
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export interface FormatJsonOptions {
  indent?: number | "tab";
  sortKeys?: boolean;
}

export function formatJson(text: string, options: FormatJsonOptions = {}): string {
  const result = parseJson(text);
  if (!result.ok) throw new JsonSyntaxError(result.error);
  const value = options.sortKeys ? sortKeysDeep(result.value) : result.value;
  return JSON.stringify(value, null, options.indent === "tab" ? "\t" : (options.indent ?? 2));
}

export function minifyJson(text: string): string {
  const result = parseJson(text);
  if (!result.ok) throw new JsonSyntaxError(result.error);
  return JSON.stringify(result.value);
}

export class JsonSyntaxError extends Error {
  readonly details: JsonError;
  constructor(details: JsonError) {
    super(`${details.message} (line ${details.line}, column ${details.column})`);
    this.name = "JsonSyntaxError";
    this.details = details;
  }
}

/**
 * Best-effort repair of "JSON-ish" text: comments, trailing commas, single quotes and unquoted keys.
 * Returns strict JSON, or throws if the result still does not parse.
 */
export function repairJson(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i] as string;
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = "";
      i++;
      while (i < n && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < n) {
          const next = text[i + 1] as string;
          str += next === "'" ? "'" : `\\${next}`;
          i += 2;
        } else {
          str += text[i] === '"' ? '\\"' : text[i] === "\n" ? "\\n" : (text[i] as string);
          i++;
        }
      }
      i++;
      out += `"${str}"`;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
    } else if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else if (/[A-Za-z_$]/.test(ch) && /[\d.]$/.test(out)) {
      // Part of a number literal such as `1e5`.
      out += ch;
      i++;
    } else if (/[A-Za-z_$]/.test(ch)) {
      let word = "";
      while (i < n && /[\w$]/.test(text[i] as string)) word += text[i++];
      const rest = text.slice(i).match(/^\s*:/);
      out += rest || !["true", "false", "null"].includes(word) ? `"${word}"` : word;
    } else {
      out += ch;
      i++;
    }
  }
  const cleaned = out.replace(/,(\s*[}\]])/g, "$1");
  const result = parseJson(cleaned);
  if (!result.ok) throw new JsonSyntaxError(result.error);
  return JSON.stringify(result.value, null, 2);
}

/* ------------------------- TypeScript type inference ------------------------- */

type Primitive = "string" | "number" | "boolean" | "null" | "unknown";
type Shape =
  | { kind: Primitive }
  | { kind: "array"; item: Shape }
  | { kind: "object"; props: Map<string, { shape: Shape; optional: boolean }> }
  | { kind: "union"; members: Shape[] };

function infer(value: unknown): Shape {
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) {
    return { kind: "array", item: value.length ? value.map(infer).reduce(mergeShapes) : { kind: "unknown" } };
  }
  switch (typeof value) {
    case "string":
      return { kind: "string" };
    case "number":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "object": {
      const props = new Map<string, { shape: Shape; optional: boolean }>();
      for (const [k, v] of Object.entries(value as object)) props.set(k, { shape: infer(v), optional: false });
      return { kind: "object", props };
    }
    default:
      return { kind: "unknown" };
  }
}

function flattenMembers(shape: Shape): Shape[] {
  return shape.kind === "union" ? shape.members : [shape];
}

function mergeShapes(a: Shape, b: Shape): Shape {
  if (a.kind === "object" && b.kind === "object") {
    const props = new Map<string, { shape: Shape; optional: boolean }>();
    for (const [k, v] of a.props) {
      const other = b.props.get(k);
      props.set(k, other ? { shape: mergeShapes(v.shape, other.shape), optional: v.optional || other.optional } : { shape: v.shape, optional: true });
    }
    for (const [k, v] of b.props) if (!a.props.has(k)) props.set(k, { shape: v.shape, optional: true });
    return { kind: "object", props };
  }
  if (a.kind === "array" && b.kind === "array") return { kind: "array", item: mergeShapes(a.item, b.item) };
  if (a.kind === b.kind && a.kind !== "union" && a.kind !== "object" && a.kind !== "array") return a;
  const members: Shape[] = [];
  for (const m of [...flattenMembers(a), ...flattenMembers(b)]) {
    const idx = members.findIndex((x) => x.kind === m.kind);
    if (idx === -1) members.push(m);
    else members[idx] = mergeShapes(members[idx] as Shape, m);
  }
  return members.length === 1 ? (members[0] as Shape) : { kind: "union", members };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

function pascal(name: string): string {
  const out = name
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? "").toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());
  return /^\d/.test(out) ? `_${out}` : out || "Item";
}

function singular(name: string): string {
  if (/ies$/i.test(name)) return name.replace(/ies$/i, "y");
  if (/(ss|us)$/i.test(name)) return name;
  return name.replace(/s$/i, "");
}

export interface TypeScriptOptions {
  rootName?: string;
  /** Use `type X = {...}` instead of `interface X {...}`. */
  useType?: boolean;
  exportTypes?: boolean;
  readonly?: boolean;
}

export function jsonToTypeScript(text: string, options: TypeScriptOptions = {}): string {
  const result = parseJson(text);
  if (!result.ok) throw new JsonSyntaxError(result.error);
  const { rootName = "Root", useType = false, exportTypes = true, readonly = false } = options;
  const declarations: string[] = [];
  const usedNames = new Set<string>();

  const uniqueName = (base: string) => {
    let name = base;
    for (let i = 2; usedNames.has(name); i++) name = `${base}${i}`;
    usedNames.add(name);
    return name;
  };

  const render = (shape: Shape, hint: string): string => {
    switch (shape.kind) {
      case "array": {
        const inner = render(shape.item, singular(hint));
        return shape.item.kind === "union" ? `(${inner})[]` : `${inner}[]`;
      }
      case "union":
        return shape.members.map((m) => render(m, hint)).join(" | ");
      case "object": {
        const name = uniqueName(pascal(hint));
        const lines = [...shape.props].map(([key, { shape: s, optional }]) => {
          const prop = IDENT.test(key) ? key : JSON.stringify(key);
          return `  ${readonly ? "readonly " : ""}${prop}${optional ? "?" : ""}: ${render(s, key)};`;
        });
        const body = lines.length ? `{\n${lines.join("\n")}\n}` : "{}";
        const prefix = exportTypes ? "export " : "";
        declarations.push(useType ? `${prefix}type ${name} = ${body};` : `${prefix}interface ${name} ${body}`);
        return name;
      }
      default:
        return shape.kind;
    }
  };

  const root = infer(result.value);
  const rendered = render(root, rootName);
  if (root.kind !== "object") {
    const prefix = exportTypes ? "export " : "";
    declarations.push(`${prefix}type ${pascal(rootName)} = ${rendered};`);
  }
  return declarations.join("\n\n");
}

/** Escape text so it can be pasted inside a JSON string. */
export function jsonStringEscape(text: string): string {
  return JSON.stringify(text);
}

export function jsonStringUnescape(text: string): string {
  const trimmed = text.trim();
  const quoted = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed : `"${trimmed}"`;
  const result = parseJson(quoted);
  if (!result.ok || typeof result.value !== "string") throw new JsonSyntaxError(result.ok ? { message: "Not a string", line: 1, column: 1, position: null } : result.error);
  return result.value;
}

/** Look up a dotted/bracketed path such as `users[0].name`. */
export function queryPath(value: unknown, path: string): unknown {
  const tokens = path
    .replace(/^\$\.?/, "")
    .match(/[^.[\]]+|\[(?:\d+|"[^"]*"|'[^']*')\]/g);
  let current: unknown = value;
  for (const raw of tokens ?? []) {
    if (current === null || current === undefined) return undefined;
    const key = raw.startsWith("[") ? raw.slice(1, -1).replace(/^["']|["']$/g, "") : raw;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
