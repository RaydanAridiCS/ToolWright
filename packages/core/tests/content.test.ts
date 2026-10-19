import { describe, expect, it } from "vitest";
import { diffStats, diffText, toSplitRows, unifiedPatch } from "../src/diff";
import { extractHeadings, markdownToHtml, markdownToText, tableOfContents } from "../src/markdown";
import { emailPayload, eventPayload, geoPayload, qrMatrix, qrToSvg, smsPayload, vcardPayload, wifiPayload } from "../src/qr";
import { generateLorem } from "../src/lorem";
import { addUtm, buildQuery, parseUrl, stripTracking } from "../src/url";
import {
  COMMON_PORTS,
  HTTP_STATUS,
  httpStatusClass,
  lookupMime,
  lookupPort,
  octalToPermissions,
  permissionsToOctal,
  permissionsToSymbolic,
  searchHttpStatus,
  symbolicToPermissions,
} from "../src/reference";

describe("diff", () => {
  it("diffs lines", () => {
    const segs = diffText("a\nb\nc\n", "a\nx\nc\n");
    expect(segs.map((s) => s.type)).toEqual(["same", "removed", "added", "same"]);
    expect(diffStats(segs)).toEqual({ added: 1, removed: 1, unchanged: 2, identical: false });
  });
  it("reports identical input", () => {
    expect(diffStats(diffText("same", "same")).identical).toBe(true);
  });
  it("diffs words and characters", () => {
    expect(diffText("the cat sat", "the dog sat", { mode: "words" }).filter((s) => s.type !== "same").map((s) => s.value.trim())).toEqual(["cat", "dog"]);
    expect(diffStats(diffText("abc", "abd", { mode: "chars" }), "chars")).toMatchObject({ added: 1, removed: 1, unchanged: 2 });
  });
  it("can ignore case and whitespace", () => {
    expect(diffStats(diffText("Hello\n", "hello\n", { ignoreCase: true })).identical).toBe(true);
    expect(diffStats(diffText("a  b\n", "a b\n", { ignoreWhitespace: true })).identical).toBe(true);
  });
  it("builds side-by-side rows with paired changes", () => {
    const rows = toSplitRows(diffText("a\nb\nc\n", "a\nB\nc\nd\n"));
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ left: { number: 2, text: "b", changed: true }, right: { number: 2, text: "B", changed: true } });
    expect(rows[3]?.left).toBeUndefined();
    expect(rows[3]?.right).toMatchObject({ number: 4, text: "d" });
  });
  it("creates unified patches", () => {
    const patch = unifiedPatch("a\nb\n", "a\nc\n", { from: "old.txt", to: "new.txt" });
    expect(patch).toContain("--- old.txt");
    expect(patch).toContain("+++ new.txt");
    expect(patch).toContain("-b");
    expect(patch).toContain("+c");
  });
});

describe("markdown", () => {
  it("renders GitHub-flavoured Markdown", () => {
    const html = markdownToHtml("# Hi\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
  });
  it("supports hard line breaks when asked", () => {
    expect(markdownToHtml("a\nb", { breaks: true })).toContain("<br>");
    expect(markdownToHtml("a\nb")).not.toContain("<br>");
  });
  it("extracts headings with unique slugs and ignores code fences", () => {
    const md = "# Title\n## Setup\n```\n# not a heading\n```\n## Setup\n### Deep *dive*";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "Title", slug: "title" },
      { level: 2, text: "Setup", slug: "setup" },
      { level: 2, text: "Setup", slug: "setup-1" },
      { level: 3, text: "Deep dive", slug: "deep-dive" },
    ]);
  });
  it("builds a table of contents", () => {
    expect(tableOfContents("# A\n## B\n### C", { maxLevel: 2 })).toBe("- [A](#a)\n  - [B](#b)");
    expect(tableOfContents("no headings")).toBe("");
  });
  it("strips Markdown to plain text", () => {
    expect(markdownToText("# Title\n\n**bold** and _it_ [link](http://x.com) `code`\n\n- item")).toBe("Title\n\nbold and it link code\n\nitem");
  });
});

describe("QR codes", () => {
  it("creates a square matrix with finder patterns", () => {
    const m = qrMatrix("hello");
    expect(m.length).toBe(m[0]?.length);
    expect(m.length).toBe(21); // version 1
    // top-left finder: 7×7 ring
    expect(m[0]?.slice(0, 7).every(Boolean)).toBe(true);
    expect(m[3]?.[3]).toBe(true);
    expect(m[1]?.[1]).toBe(false);
  });
  it("uses larger symbols for more data or stronger correction", () => {
    expect(qrMatrix("x".repeat(100)).length).toBeGreaterThan(qrMatrix("x").length);
    expect(qrMatrix("hello", "H").length).toBeGreaterThanOrEqual(qrMatrix("hello", "L").length);
  });
  it("renders SVG with colors, margin and size", () => {
    const svg = qrToSvg("hello", { dark: "#112233", light: "#ffeedd", margin: 2, size: 128 });
    expect(svg).toContain('viewBox="0 0 25 25"');
    expect(svg).toContain('width="128"');
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('fill="#ffeedd"');
  });
  it("supports a transparent background and rounded modules", () => {
    const svg = qrToSvg("hello", { light: null, rounded: true });
    expect(svg).not.toContain("<rect");
    expect(svg).toContain("a0.5 0.5");
  });
  it("refuses empty content", () => {
    expect(() => qrToSvg("")).toThrow(RangeError);
  });
  it("builds Wi-Fi payloads with escaping", () => {
    expect(wifiPayload({ ssid: "My;Net", password: 'pa:ss"word' })).toBe('WIFI:T:WPA;S:My\\;Net;P:pa\\:ss\\"word;;');
    expect(wifiPayload({ ssid: "Open", security: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Open;H:true;;");
    expect(() => wifiPayload({ ssid: "" })).toThrow(RangeError);
  });
  it("builds vCard, mailto, SMS, geo and event payloads", () => {
    const vcard = vcardPayload({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", organization: "Analytical, Inc." });
    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("FN:Ada Lovelace");
    expect(vcard).toContain("ORG:Analytical\\, Inc.");
    expect(() => vcardPayload({})).toThrow(RangeError);
    expect(emailPayload({ to: "a@b.co", subject: "Hi there", body: "x&y" })).toBe("mailto:a@b.co?subject=Hi%20there&body=x%26y");
    expect(emailPayload({ to: "a@b.co" })).toBe("mailto:a@b.co");
    expect(smsPayload("+1555", "yo")).toBe("SMSTO:+1555:yo");
    expect(geoPayload(51.5, -0.12)).toBe("geo:51.5,-0.12");
    expect(eventPayload({ title: "Launch", start: new Date("2026-10-19T09:00:00Z") })).toBe("BEGIN:VEVENT\nSUMMARY:Launch\nDTSTART:20261019T090000Z\nEND:VEVENT");
  });
});

describe("lorem ipsum", () => {
  it("starts with the classic phrase and honours counts", () => {
    expect(generateLorem({ unit: "words", count: 5 })).toBe("Lorem ipsum dolor sit amet.");
    expect(generateLorem({ unit: "sentences", count: 3 }).match(/\./g)).toHaveLength(3);
    expect(generateLorem({ unit: "paragraphs", count: 4 }).split("\n\n")).toHaveLength(4);
  });
  it("can skip the classic start, and emit HTML", () => {
    expect(generateLorem({ unit: "words", count: 2, classicStart: false }, () => 0)).toBe("Lorem lorem.");
    expect(generateLorem({ count: 2, html: true })).toMatch(/^<p>.*<\/p>\n<p>.*<\/p>$/s);
  });
  it("validates the count", () => {
    expect(() => generateLorem({ count: 0 })).toThrow(RangeError);
  });
});

describe("URLs", () => {
  it("parses every component", () => {
    const p = parseUrl("https://user:pw@example.com:8080/a/b?x=1&y=two#frag");
    expect(p).toMatchObject({ protocol: "https:", username: "user", password: "pw", hostname: "example.com", port: "8080", pathname: "/a/b", hash: "#frag", origin: "https://example.com:8080" });
    expect(p?.params).toEqual([{ key: "x", value: "1" }, { key: "y", value: "two" }]);
  });
  it("assumes https when the scheme is missing, and rejects junk", () => {
    expect(parseUrl("example.com/path")?.hostname).toBe("example.com");
    expect(parseUrl("")).toBeNull();
    expect(parseUrl("http://")).toBeNull();
  });
  it("builds query strings and UTM links", () => {
    expect(buildQuery([{ key: "a b", value: "c&d" }, { key: "", value: "skipped" }])).toBe("a+b=c%26d");
    expect(addUtm("https://x.com/p?a=1#h", { source: "news", medium: "email", campaign: "launch" })).toBe(
      "https://x.com/p?a=1&utm_source=news&utm_medium=email&utm_campaign=launch#h",
    );
  });
  it("strips tracking parameters but keeps the rest", () => {
    expect(stripTracking("https://x.com/p?id=7&utm_source=a&fbclid=zzz&gclid=1")).toBe("https://x.com/p?id=7");
  });
});

describe("reference data", () => {
  it("has well-formed HTTP statuses", () => {
    expect(new Set(HTTP_STATUS.map((s) => s.code)).size).toBe(HTTP_STATUS.length);
    expect(HTTP_STATUS.find((s) => s.code === 404)?.name).toBe("Not Found");
    expect(httpStatusClass(404)).toBe("Client error");
    expect(httpStatusClass(204)).toBe("Success");
    expect(httpStatusClass(999)).toBe("Unknown");
  });
  it("searches statuses by code prefix, name and description", () => {
    expect(searchHttpStatus("40").every((s) => String(s.code).startsWith("40") || s.name.toLowerCase().includes("40") || s.description.includes("40"))).toBe(true);
    expect(searchHttpStatus("teapot")[0]?.code).toBe(418);
    expect(searchHttpStatus("")).toHaveLength(HTTP_STATUS.length);
  });
  it("looks up MIME types and ports", () => {
    expect(lookupMime(".png")[0]?.mime).toBe("image/png");
    expect(lookupMime("json").some((m) => m.mime === "application/json")).toBe(true);
    expect(lookupPort("5432")[0]?.service).toBe("PostgreSQL");
    expect(lookupPort("redis")[0]?.port).toBe(6379);
    expect(new Set(COMMON_PORTS.map((p) => p.port)).size).toBe(COMMON_PORTS.length);
  });
  it("converts chmod permissions", () => {
    expect(permissionsToSymbolic(octalToPermissions("755"))).toBe("rwxr-xr-x");
    expect(permissionsToSymbolic(octalToPermissions("0644"))).toBe("rw-r--r--");
    expect(permissionsToOctal(symbolicToPermissions("-rwx------"))).toBe("700");
    expect(permissionsToOctal(symbolicToPermissions("rwxrwxrwx"))).toBe("777");
    for (let n = 0; n < 512; n++) {
      const octal = n.toString(8).padStart(3, "0");
      expect(permissionsToOctal(octalToPermissions(octal))).toBe(octal);
    }
    expect(() => octalToPermissions("999")).toThrow(RangeError);
    expect(() => symbolicToPermissions("rwx")).toThrow(RangeError);
  });
});
