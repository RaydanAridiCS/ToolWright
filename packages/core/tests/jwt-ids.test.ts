import { describe, expect, it } from "vitest";
import { DecodeError, base64Encode } from "../src/encoding";
import { decodeJwt, verifyJwtHmac } from "../src/jwt";
import { inspectUuid, nanoid, randomString, ulid, uuidV4, uuidV7, UUID_REGEX } from "../src/ids";

// jwt.io example token, secret "your-256-bit-secret"
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("decodeJwt", () => {
  it("decodes header, payload and time claims", () => {
    const decoded = decodeJwt(TOKEN, new Date("2030-01-01T00:00:00Z"));
    expect(decoded.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decoded.payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(decoded.times.iat).toBe("2018-01-18T01:30:22.000Z");
    expect(decoded.expired).toBeNull();
  });
  it("reports expiry and not-before status", () => {
    const body = (claims: object) => `${base64Encode('{"alg":"none"}', { urlSafe: true, padding: false })}.${base64Encode(JSON.stringify(claims), { urlSafe: true, padding: false })}.`;
    const now = new Date("2026-01-01T00:00:00Z");
    expect(decodeJwt(body({ exp: 1700000000 }), now).expired).toBe(true);
    expect(decodeJwt(body({ exp: 2000000000 }), now).expired).toBe(false);
    expect(decodeJwt(body({ nbf: 2000000000 }), now).notYetValid).toBe(true);
  });
  it("accepts a Bearer prefix", () => {
    expect(decodeJwt(`Bearer ${TOKEN}`).payload.name).toBe("John Doe");
  });
  it("rejects malformed tokens", () => {
    expect(() => decodeJwt("a.b")).toThrow(DecodeError);
    expect(() => decodeJwt("!!!.???.sig")).toThrow(/header/);
  });
});

describe("verifyJwtHmac", () => {
  it("verifies a correct secret and rejects a wrong one", async () => {
    expect(await verifyJwtHmac(TOKEN, "your-256-bit-secret")).toBe(true);
    expect(await verifyJwtHmac(TOKEN, "wrong")).toBe(false);
  });
  it("rejects tampered payloads", async () => {
    const [h, , s] = TOKEN.split(".");
    const forged = `${h}.${base64Encode('{"sub":"admin"}', { urlSafe: true, padding: false })}.${s}`;
    expect(await verifyJwtHmac(forged, "your-256-bit-secret")).toBe(false);
  });
  it("refuses unsupported algorithms", async () => {
    const none = `${base64Encode('{"alg":"RS256"}', { urlSafe: true })}.e30.sig`;
    await expect(verifyJwtHmac(none, "x")).rejects.toThrow(/RS256/);
  });
});

describe("uuid", () => {
  it("produces valid v4 UUIDs with correct version and variant bits", () => {
    const id = uuidV4();
    expect(id).toMatch(UUID_REGEX);
    expect(id[14]).toBe("4");
    expect("89ab").toContain(id[19]);
  });
  it("is deterministic for a fixed random source", () => {
    expect(uuidV4(() => new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
  });
  it("encodes the timestamp in v7 and sorts chronologically", () => {
    const a = uuidV7(undefined, 1_700_000_000_000);
    const b = uuidV7(undefined, 1_700_000_001_000);
    expect(a < b).toBe(true);
    expect(inspectUuid(a)).toEqual({ valid: true, version: 7, timestamp: "2023-11-14T22:13:20.000Z" });
  });
  it("inspects versions and rejects garbage", () => {
    expect(inspectUuid("00000000-0000-4000-8000-000000000000")).toEqual({ valid: true, version: 4 });
    expect(inspectUuid("nope").valid).toBe(false);
  });
  it("generates unique ids", () => {
    expect(new Set(Array.from({ length: 500 }, () => uuidV4())).size).toBe(500);
  });
});

describe("ulid / nanoid / randomString", () => {
  it("ulid is 26 Crockford chars and time-ordered", () => {
    const a = ulid(undefined, 1_000_000_000_000);
    const b = ulid(undefined, 1_000_000_000_001);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });
  it("randomString respects length and alphabet", () => {
    const s = randomString(200, "abc");
    expect(s).toHaveLength(200);
    expect(s).toMatch(/^[abc]+$/);
  });
  it("randomString avoids modulo bias by rejecting high bytes", () => {
    // alphabet of 10 → limit 250; bytes 250–255 must be skipped
    const calls: number[] = [];
    const rng = (n: number) => {
      calls.push(n);
      return Uint8Array.from({ length: n }, (_, i) => (i % 2 ? 255 : 3));
    };
    expect(randomString(4, "0123456789", rng)).toBe("3333");
  });
  it("validates arguments", () => {
    expect(() => randomString(5, "a")).toThrow(RangeError);
    expect(() => randomString(-1, "ab")).toThrow(RangeError);
  });
  it("nanoid defaults to 21 URL-safe characters", () => {
    expect(nanoid()).toMatch(/^[\w-]{21}$/);
    expect(nanoid(8)).toHaveLength(8);
  });
});
