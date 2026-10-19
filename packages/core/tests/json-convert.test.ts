import { describe, expect, it } from "vitest";
import { ConvertError, convertDelimiter, csvToJson, csvToMarkdownTable, flattenObject, jsonToCsv, jsonToYaml, unflattenObject, yamlToJson } from "../src/convert";
import { formatJson, jsonStringEscape, jsonStringUnescape, jsonToTypeScript, JsonSyntaxError, minifyJson, parseJson, positionToLineColumn, queryPath, repairJson, sortKeysDeep } from "../src/json";

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":[1,2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
  });
  it("reports a position for invalid JSON", () => {
    const result = parseJson('{\n  "a": 1,\n  "b": }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.line).toBe(3);
      expect(result.error.column).toBeGreaterThan(1);
    }
  });
  it("reports unexpected end of input at the end of the text", () => {
    const result = parseJson('{"a": 1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.line).toBe(1);
  });
});

describe("positionToLineColumn", () => {
  it("is 1-based", () => {
    expect(positionToLineColumn("ab\ncd", 0)).toEqual({ line: 1, column: 1 });
    expect(positionToLineColumn("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });
});

describe("formatJson / minifyJson", () => {
  it("formats with indent, tabs and sorted keys", () => {
    expect(formatJson('{"b":1,"a":{"d":1,"c":2}}', { indent: 2, sortKeys: true })).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}');
    expect(formatJson("[1]", { indent: "tab" })).toBe("[\n\t1\n]");
  });
  it("minifies", () => {
    expect(minifyJson('{\n "a": [1, 2],\n "b": "x y"\n}')).toBe('{"a":[1,2],"b":"x y"}');
  });
  it("throws JsonSyntaxError with details", () => {
    expect(() => formatJson("{")).toThrow(JsonSyntaxError);
  });
  it("sortKeysDeep sorts nested objects but not arrays", () => {
    expect(JSON.stringify(sortKeysDeep({ b: [{ z: 1, a: 2 }], a: 1 }))).toBe('{"a":1,"b":[{"a":2,"z":1}]}');
  });
});

describe("repairJson", () => {
  it("fixes single quotes, unquoted keys, comments and trailing commas", () => {
    const repaired = repairJson(`{
      // a comment
      name: 'Ada',
      "tags": ['x', 'y',],
      /* block */ active: true,
      count: 1e5,
    }`);
    expect(JSON.parse(repaired)).toEqual({ name: "Ada", tags: ["x", "y"], active: true, count: 100000 });
  });
  it("still throws on hopeless input", () => {
    expect(() => repairJson("{{{")).toThrow(JsonSyntaxError);
  });
});

describe("jsonToTypeScript", () => {
  it("infers nested interfaces", () => {
    const ts = jsonToTypeScript('{"id":1,"name":"Ada","address":{"city":"London"},"tags":["a"],"active":true,"nothing":null}');
    expect(ts).toContain("export interface Address {\n  city: string;\n}");
    expect(ts).toContain("export interface Root {");
    expect(ts).toContain("  id: number;");
    expect(ts).toContain("  address: Address;");
    expect(ts).toContain("  tags: string[];");
    expect(ts).toContain("  nothing: null;");
  });
  it("marks keys missing from some array items as optional and unions differing types", () => {
    const ts = jsonToTypeScript('{"users":[{"id":1,"email":"a@b.c"},{"id":"x"}]}');
    expect(ts).toContain("interface User {");
    expect(ts).toContain("  id: number | string;");
    expect(ts).toContain("  email?: string;");
    expect(ts).toContain("  users: User[];");
  });
  it("supports type aliases, readonly and quoted keys", () => {
    const ts = jsonToTypeScript('{"first-name":"A"}', { useType: true, readonly: true, exportTypes: false, rootName: "Person" });
    expect(ts).toBe('type Person = {\n  readonly "first-name": string;\n};');
  });
  it("handles root arrays and primitives", () => {
    expect(jsonToTypeScript("[1,2,3]")).toBe("export type Root = number[];");
    expect(jsonToTypeScript("[]", { exportTypes: false })).toBe("type Root = unknown[];");
  });
});

describe("string escaping and path queries", () => {
  it("escapes and unescapes JSON strings", () => {
    expect(jsonStringEscape('a"b\n')).toBe('"a\\"b\\n"');
    expect(jsonStringUnescape('a\\"b\\n')).toBe('a"b\n');
    expect(jsonStringUnescape('"x\\u0041"')).toBe("xA");
  });
  it("looks up dotted and bracketed paths", () => {
    const data = { users: [{ name: "Ada" }, { name: "Linus", tags: ["a"] }] };
    expect(queryPath(data, "users[1].name")).toBe("Linus");
    expect(queryPath(data, "$.users.0.name")).toBe("Ada");
    expect(queryPath(data, 'users[1]["tags"][0]')).toBe("a");
    expect(queryPath(data, "users[5].name")).toBeUndefined();
  });
});

describe("YAML", () => {
  it("converts JSON to YAML and back", () => {
    const yaml = jsonToYaml('{"name":"Ada","langs":["en","fr"],"nested":{"a":1}}');
    expect(yaml).toBe("name: Ada\nlangs:\n  - en\n  - fr\nnested:\n  a: 1\n");
    expect(JSON.parse(yamlToJson(yaml))).toEqual({ name: "Ada", langs: ["en", "fr"], nested: { a: 1 } });
  });
  it("reports YAML errors", () => {
    expect(() => yamlToJson("a: [1, 2")).toThrow(ConvertError);
  });
  it("sorts keys on request", () => {
    expect(jsonToYaml('{"b":1,"a":2}', { sortKeys: true })).toBe("a: 2\nb: 1\n");
  });
});

describe("flatten / unflatten", () => {
  const nested = { a: { b: 1, c: [1, { d: 2 }] }, e: "x" };
  it("flattens to dotted keys", () => {
    expect(flattenObject(nested)).toEqual({ "a.b": 1, "a.c.0": 1, "a.c.1.d": 2, e: "x" });
  });
  it("round trips back, rebuilding arrays", () => {
    expect(unflattenObject(flattenObject(nested))).toEqual(nested);
  });
});

describe("JSON ⇄ CSV", () => {
  const json = '[{"name":"Ada","age":36,"address":{"city":"London"}},{"name":"Linus, T","age":null,"extra":"x"}]';
  it("converts arrays of objects to CSV with the union of columns, quoting as needed", () => {
    expect(jsonToCsv(json)).toBe('name,age,address.city,extra\nAda,36,London,\n"Linus, T",,,x');
  });
  it("can skip flattening, the header, or change the delimiter", () => {
    expect(jsonToCsv('[{"a":{"b":1}}]', { flatten: false })).toBe('a\n"{""b"":1}"');
    expect(jsonToCsv('[{"a":1,"b":2}]', { header: false, delimiter: "\t" })).toBe("1\t2");
  });
  it("wraps primitives", () => {
    expect(jsonToCsv("[1,2]")).toBe("value\n1\n2");
  });
  it("parses CSV into typed JSON", () => {
    const out = JSON.parse(csvToJson('name,age,active\nAda,36,true\n"Linus, T",,false'));
    expect(out).toEqual([
      { name: "Ada", age: 36, active: true },
      { name: "Linus, T", age: null, active: false },
    ]);
  });
  it("detects delimiters and can keep everything as strings", () => {
    expect(JSON.parse(csvToJson("a;b\n1;2", { typed: false }))).toEqual([{ a: "1", b: "2" }]);
  });
  it("rebuilds nested objects from dotted headers", () => {
    expect(JSON.parse(csvToJson("a.b,c\n1,2", { unflatten: true }))).toEqual([{ a: { b: 1 }, c: 2 }]);
  });
  it("handles header-less CSV as arrays", () => {
    expect(JSON.parse(csvToJson("1,2\n3,4", { header: false }))).toEqual([[1, 2], [3, 4]]);
  });
});

describe("delimiters and Markdown tables", () => {
  it("converts CSV to TSV", () => {
    expect(convertDelimiter("a,b\n1,2", ",", "\t")).toBe("a\tb\n1\t2");
  });
  it("renders a Markdown table and escapes pipes", () => {
    expect(csvToMarkdownTable("name,note\nAda,a|b")).toBe("| name | note |\n| --- | --- |\n| Ada | a\\|b |");
  });
  it("returns an empty string for empty input", () => {
    expect(csvToMarkdownTable("")).toBe("");
  });
});
