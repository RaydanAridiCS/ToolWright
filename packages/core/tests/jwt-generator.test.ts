import { describe, expect, it } from "vitest";
import { decodeJwt, verifyJwtHmac } from "../src/jwt";
import {
  DEFAULT_JWT_HEADER,
  createDefaultPayload,
  generateJwt,
  JwtSignError,
  updateTimeClaims,
} from "../src/jwt-generator";

describe("generateJwt", () => {
  it("provides valid default header and payload generators", () => {
    expect(JSON.parse(DEFAULT_JWT_HEADER)).toEqual({ alg: "HS256", typ: "JWT" });
    const payloadJson = createDefaultPayload(new Date(1_700_000_000_000));
    const parsed = JSON.parse(payloadJson);
    expect(parsed.sub).toBe("user_12345");
    expect(parsed.name).toBe("Jane Doe");
    expect(parsed.iat).toBe(1_700_000_000);
    expect(parsed.exp).toBe(1_700_000_000 + 3600);
  });
  const secret = "super-secret-key-1234567890-test";
  const payload = { sub: "user_42", role: "admin" };

  it("generates and signs a valid HS256 JWT verifiable by verifyJwtHmac", async () => {
    const res = await generateJwt({
      algorithm: "HS256",
      payload,
      secret,
    });

    expect(res.algorithm).toBe("HS256");
    expect(res.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(res.payload).toEqual(payload);
    expect(res.token.split(".")).toHaveLength(3);

    // Verify with existing JWT decoder logic
    const isValid = await verifyJwtHmac(res.token, secret);
    expect(isValid).toBe(true);

    const decoded = decodeJwt(res.token);
    expect(decoded.header.alg).toBe("HS256");
    expect(decoded.payload.sub).toBe("user_42");
  });

  it("generates and signs valid HS384 and HS512 tokens", async () => {
    for (const alg of ["HS384", "HS512"] as const) {
      const res = await generateJwt({
        algorithm: alg,
        payload,
        secret,
      });

      expect(res.algorithm).toBe(alg);
      expect(res.header.alg).toBe(alg);
      const isValid = await verifyJwtHmac(res.token, secret);
      expect(isValid).toBe(true);
    }
  });

  it("supports unsigned 'none' algorithm with empty signature", async () => {
    const res = await generateJwt({
      algorithm: "none",
      payload,
    });

    expect(res.algorithm).toBe("none");
    expect(res.signatureBase64).toBe("");
    expect(res.token.endsWith(".")).toBe(true);
    const parts = res.token.split(".");
    expect(parts[2]).toBe("");
  });

  it("supports base64-encoded secret keys", async () => {
    const base64Secret = btoa("my-binary-secret-key");
    const res = await generateJwt({
      algorithm: "HS256",
      payload,
      secret: base64Secret,
      isSecretBase64: true,
    });

    expect(res.token.split(".")).toHaveLength(3);
  });

  it("handles stringified JSON input for header and payload", async () => {
    const headerStr = JSON.stringify({ alg: "HS256", typ: "JWT", kid: "key-1" });
    const payloadStr = JSON.stringify({ user: "test", exp: 2000000000 });

    const res = await generateJwt({
      algorithm: "HS256",
      header: headerStr,
      payload: payloadStr,
      secret,
    });

    expect(res.header.kid).toBe("key-1");
    expect(res.payload.user).toBe("test");
  });

  it("throws readable JwtSignError on invalid JSON", async () => {
    await expect(
      generateJwt({ payload: "not json", secret }),
    ).rejects.toThrow(JwtSignError);

    await expect(
      generateJwt({ payload, header: "invalid header", secret }),
    ).rejects.toThrow(JwtSignError);
  });

  it("throws when secret is missing for HMAC algorithm", async () => {
    await expect(
      generateJwt({ algorithm: "HS256", payload, secret: "" }),
    ).rejects.toThrow(/secret key is required/i);
  });

  it("throws when secret is invalid Base64 with isSecretBase64: true", async () => {
    await expect(
      generateJwt({ algorithm: "HS256", payload, secret: "invalid base64!@#", isSecretBase64: true }),
    ).rejects.toThrow(/not valid Base64/);
  });
});

describe("updateTimeClaims", () => {
  it("updates exp and iat in JSON payload", () => {
    const base = JSON.stringify({ sub: "123" });
    const fixedDate = new Date("2026-01-01T00:00:00Z");
    const nowSec = Math.floor(fixedDate.getTime() / 1000);

    const updated = updateTimeClaims(base, { addIat: true, expSeconds: 3600, now: fixedDate });
    const parsed = JSON.parse(updated) as { sub: string; iat: number; exp: number };

    expect(parsed.sub).toBe("123");
    expect(parsed.iat).toBe(nowSec);
    expect(parsed.exp).toBe(nowSec + 3600);
  });

  it("returns original string if invalid JSON", () => {
    expect(updateTimeClaims("not json", { expSeconds: 100 })).toBe("not json");
  });
});
