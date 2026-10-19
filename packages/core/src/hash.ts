/** Hashing and checksums. SHA family and HMAC use Web Crypto; MD5 and CRC32 are implemented here. */

import { bytesToBase64, utf8ToBytes } from "./encoding";

export type ShaAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export const SHA_ALGORITHMS: readonly ShaAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Web Crypto wants a plain ArrayBuffer-backed view.
const asBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

export async function sha(algorithm: ShaAlgorithm, data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? utf8ToBytes(data) : data;
  return new Uint8Array(await crypto.subtle.digest(algorithm, asBuffer(bytes)));
}

export async function hmac(algorithm: ShaAlgorithm, key: string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", asBuffer(utf8ToBytes(key)), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, asBuffer(utf8ToBytes(data))));
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4,
  11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** MD5 digest as raw bytes. MD5 is broken for security; use it only for checksums. */
export function md5Bytes(data: Uint8Array): Uint8Array {
  const length = data.length;
  const paddedLength = (((length + 8) >>> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, (length * 8) >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor((length * 8) / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = ((f >>> 0) + a + (MD5_K[i] as number) + (m[g] as number)) >>> 0;
      a = d;
      d = c;
      c = b;
      const s = MD5_S[i] as number;
      b = (b + (((sum << s) | (sum >>> (32 - s))) >>> 0)) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => outView.setUint32(i * 4, v, true));
  return out;
}

export function md5(data: Uint8Array | string): string {
  return toHex(md5Bytes(typeof data === "string" ? utf8ToBytes(data) : data));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE) as an unsigned integer. */
export function crc32(data: Uint8Array | string): number {
  const bytes = typeof data === "string" ? utf8ToBytes(data) : data;
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Adler-32 checksum as an unsigned integer. */
export function adler32(data: Uint8Array | string): number {
  const bytes = typeof data === "string" ? utf8ToBytes(data) : data;
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export interface HashResult {
  algorithm: string;
  hex: string;
  base64: string;
}

/** Compute every supported digest for the same input. */
export async function hashAll(data: Uint8Array | string): Promise<HashResult[]> {
  const bytes = typeof data === "string" ? utf8ToBytes(data) : data;
  const results: HashResult[] = [];
  const md5Digest = md5Bytes(bytes);
  results.push({ algorithm: "MD5", hex: toHex(md5Digest), base64: bytesToBase64(md5Digest) });
  for (const algorithm of SHA_ALGORITHMS) {
    const digest = await sha(algorithm, bytes);
    results.push({ algorithm, hex: toHex(digest), base64: bytesToBase64(digest) });
  }
  const crc = crc32(bytes);
  results.push({ algorithm: "CRC-32", hex: crc.toString(16).padStart(8, "0"), base64: "" });
  return results;
}
