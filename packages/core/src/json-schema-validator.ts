/** Validate a JSON document against a JSON Schema (2020-12, 2019-09, draft-07…). Pure logic: no React, no DOM, no network. */
import { Validator, type OutputUnit } from "@cfworker/json-schema";
import { JsonSyntaxError, parseJson } from "./json";

/** Drafts the validator can handle. The tool also accepts "auto", which reads the schema's `$schema` keyword. */
export type SchemaDraftId = "2020-12" | "2019-09" | "draft-07" | "draft-06" | "draft-04";

const DRAFT_META: Record<SchemaDraftId, string[]> = {
  "2020-12": ["https://json-schema.org/draft/2020-12/schema"],
  "2019-09": ["https://json-schema.org/draft/2019-09/schema"],
  "draft-07": ["http://json-schema.org/draft-07/schema#", "https://json-schema.org/draft-07/schema#"],
  "draft-06": ["http://json-schema.org/draft-06/schema#", "https://json-schema.org/draft-06/schema#"],
  "draft-04": ["http://json-schema.org/draft-04/schema#", "https://json-schema.org/draft-04/schema#"],
};

/** Which draft a `$schema` URI names, or null when it is not one we know. */
export function draftFromUri(uri: string): SchemaDraftId | null {
  for (const [id, uris] of Object.entries(DRAFT_META)) {
    if (uris.includes(uri)) return id as SchemaDraftId;
  }
  return null;
}

export interface SchemaIssue {
  /** JSON pointer into the data, as the schema spec writes it ("#/age"). */
  pointer: string;
  /** The same path in friendly form ("age", "friends[2].name", or "(root)" for "#"). */
  path: string;
  /** Keyword that failed ("type", "maximum", "required"…). */
  keyword: string;
  /** The validator's own sentence, in plain words. */
  message: string;
}

export interface SchemaValidationOptions {
  /** "auto" reads the schema's `$schema`; a fixed draft overrides it. Default "auto". */
  draft?: SchemaDraftId | "auto";
  /** Stop the report after this many problems. Default 50. */
  limit?: number;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaIssue[];
  /** Number of distinct leaf problems the schema found. */
  total: number;
  /** True when `issues` is shorter than the whole list. */
  truncated: boolean;
  /** The draft that was chosen; null when the schema states none we recognise. */
  draft: SchemaDraftId | null;
}

/**
 * Keywords that wrap the matching of inner schemas and add a parent line such as
 * `Property "age" does not match schema` right where a child error already pinpoints why.
 */
const WRAPPER_KEYWORDS = new Set([
  "properties",
  "items",
  "prefixItems",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
  "contains",
  "contentSchema",
  "if",
  "then",
  "else",
]);

/** Wrapper keywords that summarise several failed subschema branches ("does not match any/all/one"). */
const SUMMARY_KEYWORDS = new Set(["anyOf", "oneOf", "allOf"]);

/** Is `a` a parent pointer of `b`? ("#" is a parent of "#/age".) */
function isPointerParent(a: string, b: string): boolean {
  if (a === b) return false;
  return a === "#" ? b.startsWith("#/") : b.startsWith(`${a}/`);
}

function friendlyPath(pointer: string): string {
  const rest = pointer === "" || pointer === "#" ? "" : pointer.replace(/^#/, "");
  if (!rest) return "(root)";
  let out = "";
  for (const segment of rest.split("/").filter(Boolean)) {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    // A key that contains a slash must stay inside quotes so it reads as one name.
    if (/^\d+$/.test(key)) out += `[${key}]`;
    else if (key.includes("/")) out += `[${JSON.stringify(key)}]`;
    else out += out ? `.${key}` : key;
  }
  return out;
}

/** Turn the validator's raw error list into one clean list of leaf problems, without the parent noise. */
function summarise(errors: OutputUnit[]): SchemaIssue[] {
  const leaves = errors.map((e) => ({
    pointer: e.instanceLocation,
    path: friendlyPath(e.instanceLocation),
    keyword: e.keyword,
    message: e.error,
  }));
  return leaves.filter((bad) => {
    if (WRAPPER_KEYWORDS.has(bad.keyword)) {
      // Drop when a deeper error in the same subtree already explains it.
      return !leaves.some((other) => other !== bad && isPointerParent(bad.pointer, other.pointer));
    }
    if (SUMMARY_KEYWORDS.has(bad.keyword)) {
      // Drop the "does not match any subschema" line when the branches' own errors are reported.
      return !leaves.some((other) => other !== bad && other.pointer === bad.pointer && other.message !== bad.message);
    }
    return true;
  });
}

/**
 * Validate a JSON document against a JSON Schema.
 *
 * Throws with a readable message when either side is not valid JSON, and when the schema
 * points to another schema by URL (`$ref`), because nothing may be fetched over the network here.
 */
export function validateJsonAgainstSchema(dataText: string, schemaText: string, options: SchemaValidationOptions = {}): SchemaValidationResult {
  const { draft = "auto", limit = 50 } = options;
  const parsedSchema = parseJson(schemaText);
  if (!parsedSchema.ok) throw new JsonSyntaxError(parsedSchema.error);
  const parsedData = parseJson(dataText);
  if (!parsedData.ok) throw new JsonSyntaxError(parsedData.error);

  const schema = parsedSchema.value as { $schema?: string; [key: string]: unknown };
  const effective = draft === "auto" ? belong(schema.$schema) : draft;

  let outcome: ReturnType<Validator["validate"]>;
  try {
    // shortCircuit=false keeps every problem instead of stopping at the first.
    // The draft is left to the constructor, which reads the schema's $schema keyword.
    outcome = new Validator(schema, undefined, false).validate(parsedData.value);
  } catch (err) {
    throw readableRefError(err);
  }

  const issues = summarise(outcome.errors);
  const shown = issues.slice(0, limit);
  return {
    valid: outcome.valid,
    issues: shown,
    total: issues.length,
    truncated: issues.length > limit,
    draft: effective,
  };
}

/** Find the draft named by a `$schema` value, or null for anything else. */
function belong(value: unknown): SchemaDraftId | null {
  return typeof value === "string" ? draftFromUri(value) : null;
}

/** Turn a validator throw (most often an unresolved remote `$ref`) into words a person can act on. */
function readableRefError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const unresolved = /Unresolved \$ref\s+"([^"]*)"/.exec(message);
  if (unresolved) {
    return new Error(
      `This schema points to another schema with $ref "${unresolved[1]}". Schemas cannot be fetched here, because your data never leaves this tab. Put both schemas in the same document: define the other one under "$defs" and reference it as "#/$defs/<name>".`,
    );
  }
  return new Error(message.length > 240 ? `${message.slice(0, 240)}…` : message);
}
