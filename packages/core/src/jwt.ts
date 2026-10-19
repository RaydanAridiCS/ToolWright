/** JSON Web Token decoding and HS256 verification. Nothing is ever sent anywhere. */

import { base64ToBytes, bytesToUtf8, DecodeError } from "./encoding";
import { hmac, toHex } from "./hash";

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  /** Registered time claims, as ISO strings. */
  times: { exp?: string; iat?: string; nbf?: string };
  /** `true`/`false` when the token has an `exp` claim, otherwise `null`. */
  expired: boolean | null;
  /** `true` when `nbf` is in the future. */
  notYetValid: boolean;
}

function parsePart(part: string, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(bytesToUtf8(base64ToBytes(part))) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new DecodeError(`The ${label} is not valid Base64URL-encoded JSON.`);
  }
}

const toIso = (claim: unknown): string | undefined =>
  typeof claim === "number" && Number.isFinite(claim) ? new Date(claim * 1000).toISOString() : undefined;

export function decodeJwt(token: string, now: Date = new Date()): DecodedJwt {
  const parts = token.trim().replace(/^Bearer\s+/i, "").split(".");
  if (parts.length !== 3) throw new DecodeError("A JWT has three dot-separated parts: header.payload.signature.");
  const [h, p, signature] = parts as [string, string, string];
  const header = parsePart(h, "header");
  const payload = parsePart(p, "payload");
  const nowSeconds = now.getTime() / 1000;
  return {
    header,
    payload,
    signature,
    times: {
      exp: toIso(payload.exp),
      iat: toIso(payload.iat),
      nbf: toIso(payload.nbf),
    },
    expired: typeof payload.exp === "number" ? payload.exp < nowSeconds : null,
    notYetValid: typeof payload.nbf === "number" ? payload.nbf > nowSeconds : false,
  };
}

/** Verify an HS256/HS384/HS512 token signature against a shared secret. */
export async function verifyJwtHmac(token: string, secret: string): Promise<boolean> {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return false;
  const [h, p, signature] = parts as [string, string, string];
  const header = parsePart(h, "header");
  const algorithm = ({ HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" } as const)[String(header.alg) as "HS256"];
  if (!algorithm) throw new DecodeError(`Only HS256, HS384 and HS512 can be verified here (token uses ${String(header.alg)}).`);
  const expected = toHex(await hmac(algorithm, secret, `${h}.${p}`));
  let actual: string;
  try {
    actual = toHex(base64ToBytes(signature));
  } catch {
    return false;
  }
  return expected === actual;
}
