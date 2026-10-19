import { describe, expect, it } from "vitest";
import { adler32, crc32, hashAll, hmac, md5, md5Bytes, sha, toHex } from "../src/hash";

describe("md5 (RFC 1321 test suite)", () => {
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
    ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
    ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "57edf4a22be3c955ac49da2e2107b67a"],
  ])("md5(%j)", (input, expected) => {
    expect(md5(input)).toBe(expected);
  });

  it("handles inputs around the 55/56/64-byte padding boundaries", () => {
    expect(md5("a".repeat(55))).toBe("ef1772b6dff9a122358552954ad0df65");
    expect(md5("a".repeat(56))).toBe("3b0c8ac703f828b04c6c197006d17218");
    expect(md5("a".repeat(64))).toBe("014842d480b571495a4a0363793f7367");
  });
  it("returns 16 bytes", () => {
    expect(md5Bytes(new Uint8Array(0))).toHaveLength(16);
  });
});

describe("SHA family", () => {
  it("matches published vectors for 'abc'", async () => {
    expect(toHex(await sha("SHA-1", "abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(toHex(await sha("SHA-256", "abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(toHex(await sha("SHA-512", "abc"))).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
  });
  it("hashes bytes and strings identically", async () => {
    expect(toHex(await sha("SHA-256", new TextEncoder().encode("abc")))).toBe(toHex(await sha("SHA-256", "abc")));
  });
});

describe("HMAC", () => {
  it("matches RFC 4231 test case 2", async () => {
    const mac = await hmac("SHA-256", "Jefe", "what do ya want for nothing?");
    expect(toHex(mac)).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });
});

describe("checksums", () => {
  it("computes CRC-32", () => {
    expect(crc32("")).toBe(0);
    expect(crc32("123456789")).toBe(0xcbf43926);
    expect(crc32("The quick brown fox jumps over the lazy dog")).toBe(0x414fa339);
  });
  it("computes Adler-32", () => {
    expect(adler32("Wikipedia")).toBe(0x11e60398);
  });
});

describe("hashAll", () => {
  it("returns every algorithm", async () => {
    const results = await hashAll("abc");
    expect(results.map((r) => r.algorithm)).toEqual(["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512", "CRC-32"]);
    expect(results[0]?.hex).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(results[0]?.base64).toBe("kAFQmDzST7DWlj99KOF/cg==");
    expect(results.at(-1)?.hex).toBe("352441c2");
  });
});
