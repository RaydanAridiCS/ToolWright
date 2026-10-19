/** Identifier generators backed by crypto.getRandomValues. */

import { toHex } from "./hash";

export type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function uuidV4(random: RandomBytes = defaultRandomBytes): string {
  const b = random(16);
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  return formatUuid(b);
}

/** UUID v7: 48-bit Unix millisecond timestamp followed by random bits. Sortable by creation time. */
export function uuidV7(random: RandomBytes = defaultRandomBytes, now: number = Date.now()): string {
  const b = random(16);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  b[6] = ((b[6] as number) & 0x0f) | 0x70;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  return formatUuid(b);
}

function formatUuid(b: Uint8Array): string {
  const hex = toHex(b);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inspectUuid(value: string): { valid: boolean; version?: number; timestamp?: string } {
  const match = UUID_REGEX.exec(value.trim());
  if (!match) return { valid: false };
  const version = Number(match[1]);
  const result: { valid: boolean; version: number; timestamp?: string } = { valid: true, version };
  if (version === 7) {
    const ms = parseInt(value.trim().replace(/-/g, "").slice(0, 12), 16);
    result.timestamp = new Date(ms).toISOString();
  }
  return result;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48-bit timestamp + 80 bits of randomness, Crockford Base32, lexicographically sortable. */
export function ulid(random: RandomBytes = defaultRandomBytes, now: number = Date.now()): string {
  let time = "";
  let ts = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[ts % 32] + time;
    ts = Math.floor(ts / 32);
  }
  const bytes = random(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[(bytes[i] as number) % 32];
  return time + rand;
}

const URL_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/** NanoID-style random string. Unbiased for alphabets whose size divides 256; otherwise uses rejection sampling. */
export function randomString(length: number, alphabet: string = URL_ALPHABET, random: RandomBytes = defaultRandomBytes): string {
  if (alphabet.length < 2 || alphabet.length > 256) throw new RangeError("Alphabet must contain between 2 and 256 characters.");
  if (length < 0) throw new RangeError("Length must not be negative.");
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    const bytes = random(Math.max(16, (length - out.length) * 2));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export const nanoid = (length = 21, random?: RandomBytes) => randomString(length, URL_ALPHABET, random);
