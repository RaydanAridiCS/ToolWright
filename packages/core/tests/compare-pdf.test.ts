import { describe, expect, it } from "vitest";
import {
  collapseRows,
  compareText,
  documentLines,
  inlineSegments,
  looksScanned,
  nextChangedPage,
  pageChange,
  pairPages,
  shapesDiffer,
  textReport,
} from "../src/compare-pdf";

describe("documentLines", () => {
  it("lists non-empty lines and remembers each line's page", () => {
    expect(documentLines(["one\n\ntwo  \n", "", "three"])).toEqual({ lines: ["one", "two", "three"], pageOfLine: [1, 1, 3] });
  });

  it("copes with Windows line ends and no pages", () => {
    expect(documentLines(["a\r\nb"]).lines).toEqual(["a", "b"]);
    expect(documentLines([])).toEqual({ lines: [], pageOfLine: [] });
  });
});

describe("compareText", () => {
  const a = ["Intro line\nPrice is 10 dollars\nShared line", "Page two\nOld clause"];
  const b = ["Intro line\nPrice is 12 dollars\nShared line", "Page two\nNew clause\nExtra clause"];

  it("reports edits, additions and which pages changed", () => {
    const r = compareText(a, b);
    expect(r.identical).toBe(false);
    expect(r.removedLines).toBe(2);
    expect(r.addedLines).toBe(3);
    expect(r.changedPagesA).toEqual([1, 2]);
    expect(r.changedPagesB).toEqual([1, 2]);
  });

  it("pairs an edited line with its new version and marks the changed words", () => {
    const r = compareText(a, b);
    const row = r.rows.find((x) => x.left?.text === "Price is 10 dollars")!;
    expect(row.right?.text).toBe("Price is 12 dollars");
    expect(row.inline?.left.some((s) => s.type === "removed" && s.value.includes("10"))).toBe(true);
    expect(row.inline?.right.some((s) => s.type === "added" && s.value.includes("12"))).toBe(true);
  });

  it("attributes lines to the page they appear on, not the line number", () => {
    const r = compareText(["A\nB", "C"], ["A\nB", "C\nD"]);
    const added = r.rows.find((x) => x.right?.changed)!;
    expect(added.right).toMatchObject({ text: "D", page: 2, changed: true });
    expect(r.changedPagesA).toEqual([]);
    expect(r.changedPagesB).toEqual([2]);
  });

  it("is identical for the same text, whatever the page breaks", () => {
    expect(compareText(["x\ny"], ["x", "y"]).identical).toBe(true);
  });

  it("can ignore case and extra spaces", () => {
    expect(compareText(["Hello  World"], ["hello world"], { ignoreCase: true, ignoreWhitespace: true }).identical).toBe(true);
    expect(compareText(["Hello"], ["hello"]).identical).toBe(false);
  });

  it("handles empty documents on either side", () => {
    expect(compareText([], []).identical).toBe(true);
    const r = compareText([], ["new"]);
    expect(r.addedLines).toBe(1);
    expect(r.changedPagesB).toEqual([1]);
  });
});

describe("inlineSegments", () => {
  it("keeps unchanged words on both sides", () => {
    const { left, right } = inlineSegments("the red fox", "the blue fox");
    expect(left.map((s) => s.value).join("")).toBe("the red fox");
    expect(right.map((s) => s.value).join("")).toBe("the blue fox");
    expect(left.every((s) => s.type !== "added")).toBe(true);
    expect(right.every((s) => s.type !== "removed")).toBe(true);
  });
});

describe("collapseRows", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ left: { number: i + 1, text: `l${i}`, page: 1, changed: i === 10 } }));

  it("keeps a little context and hides long unchanged stretches", () => {
    const items = collapseRows(rows, 2);
    expect(items.filter((i) => i.kind === "row")).toHaveLength(5);
    const gaps = items.filter((i) => i.kind === "gap");
    expect(gaps).toEqual([
      { kind: "gap", count: 8, from: 0 },
      { kind: "gap", count: 7, from: 13 },
    ]);
  });

  it("shows everything when everything changed, and one gap when nothing did", () => {
    expect(collapseRows(rows.map((r) => ({ left: { ...r.left, changed: true } })), 1).every((i) => i.kind === "row")).toBe(true);
    expect(collapseRows(rows.map((r) => ({ left: { ...r.left, changed: false } })))).toEqual([{ kind: "gap", count: 20, from: 0 }]);
    expect(collapseRows([])).toEqual([]);
  });
});

describe("looksScanned", () => {
  it("is true only when every page has almost no text", () => {
    expect(looksScanned(["", " \n", "ab"])).toBe(true);
    expect(looksScanned(["", "plenty of words here"])).toBe(false);
    expect(looksScanned([])).toBe(false);
  });
});

describe("textReport", () => {
  it("lists changed lines with their pages", () => {
    const report = textReport(compareText(["a\nb"], ["a\nc"]), { a: "old.pdf", b: "new.pdf" });
    expect(report).toContain("old.pdf (A) and new.pdf (B)");
    expect(report).toContain("- [A p.1] b");
    expect(report).toContain("+ [B p.1] c");
  });

  it("says when nothing changed", () => {
    expect(textReport(compareText(["a"], ["a"]), { a: "x", b: "y" })).toContain("The text is identical.");
  });
});

describe("page pictures", () => {
  it("flags shapes that differ by more than 1%", () => {
    expect(shapesDiffer({ width: 595, height: 842 }, { width: 595, height: 842 })).toBe(false);
    expect(shapesDiffer({ width: 595, height: 842 }, { width: 600, height: 842 })).toBe(false);
    expect(shapesDiffer({ width: 595, height: 842 }, { width: 842, height: 595 })).toBe(true);
    expect(shapesDiffer({ width: 0, height: 10 }, { width: 5, height: 5 })).toBe(true);
  });

  it("counts a page as changed above the limit or when its size differs", () => {
    expect(pageChange(1, 0, false).changed).toBe(false);
    expect(pageChange(1, 0.0001, false).changed).toBe(false);
    expect(pageChange(1, 0.01, false).changed).toBe(true);
    expect(pageChange(1, 0, true).changed).toBe(true);
  });

  it("pairs pages by position and reports the extras", () => {
    expect(pairPages(3, 5)).toEqual({ common: 3, onlyInA: [], onlyInB: [4, 5] });
    expect(pairPages(4, 2)).toEqual({ common: 2, onlyInA: [3, 4], onlyInB: [] });
    expect(pairPages(0, 0)).toEqual({ common: 0, onlyInA: [], onlyInB: [] });
  });

  it("finds the next and previous changed page, wrapping round", () => {
    const changes = [1, 2, 3, 4, 5].map((p) => pageChange(p, p === 2 || p === 4 ? 0.1 : 0, false));
    expect(nextChangedPage(changes, 1)).toBe(2);
    expect(nextChangedPage(changes, 2)).toBe(4);
    expect(nextChangedPage(changes, 4)).toBe(2);
    expect(nextChangedPage(changes, 2, -1)).toBe(4);
    expect(nextChangedPage(changes, 4, -1)).toBe(2);
    expect(nextChangedPage(changes.map((c) => ({ ...c, changed: false })), 1)).toBeNull();
  });
});
