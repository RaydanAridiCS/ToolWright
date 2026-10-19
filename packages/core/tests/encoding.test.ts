import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  base64ToBytes,
  binaryDecode,
  binaryEncode,
  bytesToBase64,
  DecodeError,
  escapeString,
  hexDecode,
  hexEncode,
  htmlEscape,
  htmlUnescape,
  morseDecode,
  morseEncode,
  rot13,
  unescapeString,
  unicodeEscape,
  unicodeUnescape,
  urlDecode,
  urlEncode,
} from "../src/encoding";

describe("base64", () => {
  it.each([
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg=="],
    ["fooba", "Zm9vYmE="],
    ["foobar", "Zm9vYmFy"],
  ])("RFC 4648 vector %j", (plain, encoded) => {
    expect(base64Encode(plain)).toBe(encoded);
    expect(base64Decode(encoded)).toBe(plain);
  });

  it("is UTF-8 safe", () => {
    const text = "héllo 世界 🚀";
    expect(base64Decode(base64Encode(text))).toBe(text);
  });
  it("supports URL-safe output without padding", () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xfe]);
    expect(bytesToBase64(bytes)).toBe("+//+");
    expect(bytesToBase64(bytes, { urlSafe: true })).toBe("-__-");
    expect(bytesToBase64(Uint8Array.from([0xff]), { urlSafe: true, padding: false })).toBe("_w");
  });
  it("decodes URL-safe and unpadded input and ignores whitespace", () => {
    expect(Array.from(base64ToBytes("-__-"))).toEqual([0xfb, 0xff, 0xfe]);
    expect(base64Decode("Zm9v\nYmFy")).toBe("foobar");
    expect(base64Decode("Zm9vYg")).toBe("foob");
  });
  it("rejects invalid input", () => {
    expect(() => base64Decode("not base64!")).toThrow(DecodeError);
    expect(() => base64Decode("Z")).toThrow(DecodeError);
  });
  it("rejects bytes that are not UTF-8 text", () => {
    expect(() => base64Decode("/w==")).toThrow(/UTF-8/);
  });
});

describe("url encoding", () => {
  it("encodes components and full URLs differently", () => {
    expect(urlEncode("a b&c=d/é")).toBe("a%20b%26c%3Dd%2F%C3%A9");
    expect(urlEncode("https://x.com/a b?q=é", "full")).toBe("https://x.com/a%20b?q=%C3%A9");
  });
  it("decodes and treats + as space in component mode", () => {
    expect(urlDecode("a+b%20c%C3%A9")).toBe("a b cé");
  });
  it("throws a friendly error for malformed escapes", () => {
    expect(() => urlDecode("%E0%A4%A")).toThrow(DecodeError);
    expect(() => urlEncode("\ud800")).toThrow(DecodeError);
  });
});

describe("html entities", () => {
  it("escapes the five special characters", () => {
    expect(htmlEscape(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
  it("unescapes named, decimal and hex entities", () => {
    expect(htmlUnescape("&lt;p&gt; &copy; &#169; &#xA9; &hellip; &unknown; &#xD800;")).toBe("<p> © © © … &unknown; &#xD800;");
  });
  it("round trips", () => {
    const s = `5 > 3 && "quotes" 'single'`;
    expect(htmlUnescape(htmlEscape(s))).toBe(s);
  });
});

describe("hex and binary", () => {
  it("encodes and decodes hex", () => {
    expect(hexEncode("Hi!")).toBe("48 69 21");
    expect(hexEncode("Hi!", { separator: "", uppercase: true })).toBe("486921");
    expect(hexDecode("0x48, 0x69 21")).toBe("Hi!");
    expect(hexDecode("48:69:21")).toBe("Hi!");
  });
  it("rejects bad hex", () => {
    expect(() => hexDecode("4")).toThrow(DecodeError);
    expect(() => hexDecode("zz")).toThrow(DecodeError);
  });
  it("encodes and decodes binary", () => {
    expect(binaryEncode("A")).toBe("01000001");
    expect(binaryDecode("01001000 01101001")).toBe("Hi");
    expect(() => binaryDecode("0101")).toThrow(DecodeError);
  });
});

describe("rot13 and morse", () => {
  it("rot13 is its own inverse", () => {
    expect(rot13("Hello, World!")).toBe("Uryyb, Jbeyq!");
    expect(rot13(rot13("Hello"))).toBe("Hello");
  });
  it("supports arbitrary shifts", () => {
    expect(rot13("abc", 1)).toBe("bcd");
    expect(rot13("abc", -1)).toBe("zab");
  });
  it("encodes and decodes morse", () => {
    expect(morseEncode("SOS HELP")).toBe("... --- ... / .... . .-.. .--.");
    expect(morseDecode("... --- ... / .... . .-.. .--.")).toBe("sos help");
  });
});

describe("string escaping", () => {
  it("escapes for several languages", () => {
    expect(escapeString('a"b\n', "json")).toBe('a\\"b\\n');
    expect(escapeString("it's", "sql")).toBe("it''s");
    expect(escapeString("it's", "shell")).toBe(`'it'\\''s'`);
    expect(escapeString('tab\t"q"', "javascript")).toBe('tab\\t\\"q\\"');
  });
  it("unescapes common sequences", () => {
    expect(unescapeString("line1\\nline2\\t\\\"q\\\" \\u0041 \\x41 \\u{1F600} \\\\")).toBe('line1\nline2\t"q" A A 😀 \\');
  });
  it("round trips unicode escapes", () => {
    const s = "héllo 😀";
    expect(unicodeEscape(s)).toBe("h\\u00e9llo \\ud83d\\ude00");
    expect(unicodeUnescape(unicodeEscape(s))).toBe(s);
  });
});
