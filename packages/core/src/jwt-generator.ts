/**
 * Pure TypeScript logic for creating and signing JSON Web Tokens (JWT).
 * Supports HMAC algorithms (HS256, HS384, HS512) and unsecured tokens (none).
 * All signing uses the Web Crypto API locally; nothing leaves the device.
 */

import { base64ToBytes, bytesToBase64, utf8ToBytes } from "./encoding";

export type JwtAlgorithm = "HS256" | "HS384" | "HS512" | "none";

export interface GenerateJwtOptions {
  algorithm?: JwtAlgorithm;
  header?: string | Record<string, unknown>;
  payload: string | Record<string, unknown>;
  secret?: string;
  isSecretBase64?: boolean;
}

export interface GeneratedJwt {
  token: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  headerBase64: string;
  payloadBase64: string;
  signatureBase64: string;
  algorithm: JwtAlgorithm;
}

export class JwtSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtSignError";
  }
}

export const DEFAULT_JWT_HEADER = JSON.stringify(
  {
    alg: "HS256",
    typ: "JWT",
  },
  null,
  2,
);

export function createDefaultPayload(now: Date = new Date()): string {
  const nowSec = Math.floor(now.getTime() / 1000);
  return JSON.stringify(
    {
      sub: "user_12345",
      name: "Jane Doe",
      role: "admin",
      iat: nowSec,
      exp: nowSec + 3600,
    },
    null,
    2,
  );
}

const asBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

/**
 * Creates and signs a JSON Web Token.
 * Throws a readable `JwtSignError` for invalid JSON, missing secrets, or malformed Base64 keys.
 */
export async function generateJwt(options: GenerateJwtOptions): Promise<GeneratedJwt> {
  const algorithm = options.algorithm ?? "HS256";

  // Parse and validate header
  let headerObj: Record<string, unknown>;
  if (typeof options.header === "string") {
    try {
      headerObj = JSON.parse(options.header) as Record<string, unknown>;
      if (!headerObj || typeof headerObj !== "object" || Array.isArray(headerObj)) {
        throw new Error("Header must be a JSON object.");
      }
    } catch (err) {
      throw new JwtSignError(err instanceof Error && err.message !== "Header must be a JSON object." ? `Invalid header JSON: ${err.message}` : "Header must be a valid JSON object.");
    }
  } else if (options.header && typeof options.header === "object" && !Array.isArray(options.header)) {
    headerObj = { ...options.header };
  } else {
    headerObj = { alg: algorithm, typ: "JWT" };
  }

  // Ensure header has matching alg and typ
  headerObj.alg = algorithm;
  if (!headerObj.typ) headerObj.typ = "JWT";

  // Parse and validate payload
  let payloadObj: Record<string, unknown>;
  if (typeof options.payload === "string") {
    try {
      payloadObj = JSON.parse(options.payload) as Record<string, unknown>;
      if (!payloadObj || typeof payloadObj !== "object" || Array.isArray(payloadObj)) {
        throw new Error("Payload must be a JSON object.");
      }
    } catch (err) {
      throw new JwtSignError(err instanceof Error && err.message !== "Payload must be a JSON object." ? `Invalid payload JSON: ${err.message}` : "Payload must be a valid JSON object.");
    }
  } else if (options.payload && typeof options.payload === "object" && !Array.isArray(options.payload)) {
    payloadObj = { ...options.payload };
  } else {
    throw new JwtSignError("Payload must be a valid JSON object.");
  }

  const headerJson = JSON.stringify(headerObj);
  const payloadJson = JSON.stringify(payloadObj);

  const headerBase64 = bytesToBase64(utf8ToBytes(headerJson), { urlSafe: true, padding: false });
  const payloadBase64 = bytesToBase64(utf8ToBytes(payloadJson), { urlSafe: true, padding: false });
  const signingInput = `${headerBase64}.${payloadBase64}`;

  let signatureBase64 = "";

  if (algorithm !== "none") {
    const secret = options.secret ?? "";
    if (!secret) {
      throw new JwtSignError(`A secret key is required to sign with ${algorithm}.`);
    }

    let secretKeyBytes: Uint8Array;
    if (options.isSecretBase64) {
      try {
        secretKeyBytes = base64ToBytes(secret);
      } catch {
        throw new JwtSignError("Secret key is not valid Base64.");
      }
    } else {
      secretKeyBytes = utf8ToBytes(secret);
    }

    const shaAlg = ({
      HS256: "SHA-256",
      HS384: "SHA-384",
      HS512: "SHA-512",
    } as const)[algorithm];

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      asBuffer(secretKeyBytes),
      { name: "HMAC", hash: shaAlg },
      false,
      ["sign"],
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, asBuffer(utf8ToBytes(signingInput)));
    signatureBase64 = bytesToBase64(new Uint8Array(sigBuffer), { urlSafe: true, padding: false });
  }

  const token = `${signingInput}.${signatureBase64}`;

  return {
    token,
    header: headerObj,
    payload: payloadObj,
    headerBase64,
    payloadBase64,
    signatureBase64,
    algorithm,
  };
}

/** Helper to add or update exp / iat claims in a payload string. */
export function updateTimeClaims(
  payloadStr: string,
  options: { addIat?: boolean; expSeconds?: number; now?: Date },
): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payloadStr) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return payloadStr;
  } catch {
    return payloadStr;
  }

  const nowSec = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (options.addIat) {
    parsed.iat = nowSec;
  }
  if (options.expSeconds !== undefined) {
    parsed.exp = nowSec + options.expSeconds;
  }

  return JSON.stringify(parsed, null, 2);
}
