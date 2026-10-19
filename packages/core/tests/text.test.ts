import { describe, expect, it } from "vitest";
import { convertCase, countText, decorateLines, findReplace, processLines, reverseText, slugify, splitWords, wordFrequency, cleanWhitespace } from "../src/text";

describe("splitWords", () => {
  it("splits camelCase, snake_case, kebab-case and spaces", () => {
    expect(splitWords("helloWorld_foo-bar baz")).toEqual(["hello", "World", "foo", "bar", "baz"]);
  });
  it("keeps acronyms together", () => {
    expect(splitWords("parseHTTPResponse")).toEqual(["parse", "HTTP", "Response"]);
  });
});

describe("convertCase", () => {
  const input = "hello big World";
  it.each([
    ["camel", "helloBigWorld"],
    ["pascal", "HelloBigWorld"],
    ["snake", "hello_big_world"],
    ["kebab", "hello-big-world"],
    ["constant", "HELLO_BIG_WORLD"],
    ["dot", "hello.big.world"],
    ["path", "hello/big/world"],
    ["upper", "HELLO BIG WORLD"],
    ["lower", "hello big world"],
    ["title", "Hello Big World"],
  ] as const)("%s", (style, expected) => {
    expect(convertCase(input, style)).toBe(expected);
  });

  it("sentence case capitalises after terminators", () => {
    expect(convertCase("first one. second ONE! third?", "sentence")).toBe("First one. Second one! Third?");
  });
  it("swaps case", () => {
    expect(convertCase("aBc", "swap")).toBe("AbC");
  });
  it("converts each line independently", () => {
    expect(convertCase("one two\nthree four", "snake")).toBe("one_two\nthree_four");
  });
});

describe("slugify", () => {
  it("removes diacritics and punctuation", () => {
    expect(slugify("  Crème Brûlée & Friends!  ")).toBe("creme-brulee-and-friends");
  });
  it("supports custom separators, casing and max length", () => {
    expect(slugify("Hello World", { separator: "_", lowercase: false })).toBe("Hello_World");
    expect(slugify("one two three four", { maxLength: 9 })).toBe("one-two-t");
    expect(slugify("one two three", { maxLength: 8 })).toBe("one-two");
  });
});

describe("countText", () => {
  it("handles empty input", () => {
    expect(countText("")).toMatchObject({ characters: 0, words: 0, lines: 0, sentences: 0, paragraphs: 0 });
  });
  it("counts words, sentences, paragraphs and lines", () => {
    const stats = countText("Hello world. How are you?\n\nSecond paragraph here.");
    expect(stats.words).toBe(8);
    expect(stats.sentences).toBe(3);
    expect(stats.paragraphs).toBe(2);
    expect(stats.lines).toBe(3);
  });
  it("counts Unicode characters and UTF-8 bytes separately", () => {
    const stats = countText("héllo 👋");
    expect(stats.characters).toBe(7);
    expect(stats.bytes).toBe(11);
  });
});

describe("processLines", () => {
  const text = "banana\napple\nCherry\napple\n\n";
  it("dedupes and sorts", () => {
    expect(processLines(text, { removeEmpty: true, dedupe: true, sort: "asc" })).toBe("Cherry\napple\nbanana");
  });
  it("sorts case-insensitively", () => {
    expect(processLines(text, { removeEmpty: true, dedupe: true, sort: "asc", caseInsensitive: true })).toBe("apple\nbanana\nCherry");
  });
  it("sorts naturally", () => {
    expect(processLines("file10\nfile2\nfile1", { sort: "natural" })).toBe("file1\nfile2\nfile10");
  });
  it("reverses", () => {
    expect(processLines("a\nb\nc", { reverse: true })).toBe("c\nb\na");
  });
  it("shuffles using the supplied RNG", () => {
    const out = processLines("a\nb\nc\nd", { sort: "random" }, () => 0);
    expect(out.split("\n").sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("decorateLines", () => {
  it("adds prefix, suffix and numbers", () => {
    expect(decorateLines("a\nb", { prefix: "- ", suffix: ";", numbered: true })).toBe("1. - a;\n2. - b;");
  });
});

describe("wordFrequency", () => {
  it("ranks words and ignores case", () => {
    expect(wordFrequency("The cat and the hat and THE bat", 2)).toEqual([
      { word: "the", count: 3 },
      { word: "and", count: 2 },
    ]);
  });
});

describe("cleanWhitespace", () => {
  it("collapses spaces and blank lines", () => {
    expect(cleanWhitespace("a   b  \n\n\n\n c ", { collapseSpaces: true, trimLines: true, collapseBlankLines: true })).toBe("a b\n\nc");
  });
  it("removes line breaks", () => {
    expect(cleanWhitespace("a\nb\n\nc", { removeLineBreaks: true })).toBe("a b c");
  });
});

describe("reverseText", () => {
  it("reverses characters without breaking emoji", () => {
    expect(reverseText("ab😀")).toBe("😀ba");
  });
  it("reverses word order", () => {
    expect(reverseText("one two three", "words")).toBe("three two one");
  });
});

describe("findReplace", () => {
  it("replaces plain text literally, including $ patterns", () => {
    expect(findReplace("a.b a.b", ".", "$&$&")).toEqual({ output: "a$&$&b a$&$&b", count: 2 });
  });
  it("supports regex with capture groups", () => {
    expect(findReplace("2026-10-19", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1", { regex: true })).toEqual({ output: "19/10/2026", count: 1 });
  });
  it("respects case sensitivity and whole words", () => {
    expect(findReplace("Cat cat concat", "cat", "dog", { wholeWord: true }).output).toBe("dog dog concat");
    expect(findReplace("Cat cat", "cat", "dog", { caseSensitive: true }).output).toBe("Cat dog");
  });
  it("returns the input untouched for an empty search", () => {
    expect(findReplace("abc", "", "x")).toEqual({ output: "abc", count: 0 });
  });
});
