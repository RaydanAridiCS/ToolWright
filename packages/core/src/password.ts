/** Password and passphrase generation plus a transparent strength estimate. */

import { wordlist } from "@scure/bip39/wordlists/english.js";
import { randomString, type RandomBytes } from "./ids";

const defaultRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
} as const;

const AMBIGUOUS = /[O0oIl1|`'"]/g;

export interface PasswordOptions {
  length?: number;
  lower?: boolean;
  upper?: boolean;
  digits?: boolean;
  symbols?: boolean;
  excludeAmbiguous?: boolean;
  /** Characters to always exclude. */
  exclude?: string;
}

export interface GeneratedPassword {
  password: string;
  entropyBits: number;
  poolSize: number;
}

function poolFor(options: PasswordOptions): string[] {
  const { lower = true, upper = true, digits = true, symbols = false, excludeAmbiguous = false, exclude = "" } = options;
  const classes = [lower && CHARSETS.lower, upper && CHARSETS.upper, digits && CHARSETS.digits, symbols && CHARSETS.symbols].filter(Boolean) as string[];
  return classes
    .map((chars) => {
      let out = excludeAmbiguous ? chars.replace(AMBIGUOUS, "") : chars;
      if (exclude) out = Array.from(out).filter((c) => !exclude.includes(c)).join("");
      return out;
    })
    .filter((chars) => chars.length > 0);
}

/** Generate a random password containing at least one character from every enabled class. */
export function generatePassword(options: PasswordOptions = {}, random: RandomBytes = defaultRandomBytes): GeneratedPassword {
  const length = options.length ?? 20;
  const classes = poolFor(options);
  if (classes.length === 0) throw new RangeError("Select at least one character type.");
  if (length < classes.length) throw new RangeError(`Length must be at least ${classes.length} to include every selected type.`);
  if (length > 4096) throw new RangeError("Length must be 4096 or less.");
  const all = classes.join("");
  const chars = Array.from(randomString(length, all, random));
  // Guarantee one character from every class at distinct random positions.
  const positions = shuffledIndexes(length, random);
  classes.forEach((cls, i) => {
    chars[positions[i] as number] = randomString(1, cls, random);
  });
  const unique = new Set(all).size;
  return { password: chars.join(""), entropyBits: length * Math.log2(unique), poolSize: unique };
}

function shuffledIndexes(n: number, random: RandomBytes): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const k = randomInt(i + 1, random);
    [idx[i], idx[k]] = [idx[k] as number, idx[i] as number];
  }
  return idx;
}

/** Unbiased random integer in [0, max). */
export function randomInt(max: number, random: RandomBytes = defaultRandomBytes): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError("max must be an integer between 1 and 2^32.");
  const limit = Math.floor(2 ** 32 / max) * max;
  for (;;) {
    const b = random(4);
    const n = ((b[0] as number) * 2 ** 24) + ((b[1] as number) << 16) + ((b[2] as number) << 8) + (b[3] as number);
    if (n < limit) return n % max;
  }
}

export interface PassphraseOptions {
  words?: number;
  separator?: string;
  capitalize?: boolean;
  includeNumber?: boolean;
}

export const WORDLIST_SIZE = wordlist.length;

export function generatePassphrase(options: PassphraseOptions = {}, random: RandomBytes = defaultRandomBytes): GeneratedPassword {
  const { words = 6, separator = "-", capitalize = false, includeNumber = false } = options;
  if (words < 2 || words > 24) throw new RangeError("Use between 2 and 24 words.");
  const picked = Array.from({ length: words }, () => {
    const w = wordlist[randomInt(wordlist.length, random)] as string;
    return capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  });
  let entropy = words * Math.log2(wordlist.length);
  if (includeNumber) {
    picked[randomInt(words, random)] += String(randomInt(10, random));
    entropy += Math.log2(words * 10);
  }
  return { password: picked.join(separator), entropyBits: entropy, poolSize: wordlist.length };
}

export type StrengthLabel = "very weak" | "weak" | "fair" | "strong" | "very strong";

export interface StrengthEstimate {
  entropyBits: number;
  label: StrengthLabel;
  /** 0-4 */
  score: number;
  warnings: string[];
  crackTime: string;
}

const COMMON = new Set([
  "password", "123456", "123456789", "12345678", "qwerty", "abc123", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon", "football",
  "baseball", "master", "sunshine", "princess", "login", "passw0rd", "p@ssw0rd", "trustno1", "111111", "000000", "qwerty123", "1q2w3e4r",
]);

function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds > 1e18) return "longer than the age of the universe";
  const units: [string, number][] = [
    ["centuries", 3.15576e9],
    ["years", 31557600],
    ["days", 86400],
    ["hours", 3600],
    ["minutes", 60],
  ];
  if (seconds < 1) return "instantly";
  for (const [name, size] of units) if (seconds >= size) return `${Math.round(seconds / size).toLocaleString("en-US")} ${name}`;
  return `${Math.round(seconds)} seconds`;
}

/** Heuristic estimate from character variety and length, with penalties for obvious patterns. Not a guarantee. */
export function estimateStrength(password: string, guessesPerSecond = 1e10): StrengthEstimate {
  const warnings: string[] = [];
  if (!password) return { entropyBits: 0, label: "very weak", score: 0, warnings: [], crackTime: "instantly" };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 32;
  let entropy = password.length * Math.log2(Math.max(pool, 2));

  if (COMMON.has(password.toLowerCase())) {
    warnings.push("This is one of the most common passwords.");
    entropy = Math.min(entropy, 10);
  }
  if (/(.)\1{2,}/.test(password)) {
    warnings.push("Repeated characters make guessing easier.");
    entropy *= 0.8;
  }
  if (/(?:abc|bcd|cde|def|012|123|234|345|456|567|678|789|qwe|wer|ert|asd|sdf|zxc)/i.test(password)) {
    warnings.push("Contains a common keyboard or alphabet sequence.");
    entropy *= 0.85;
  }
  if (/^[a-zA-Z]+\d{1,4}$/.test(password)) {
    warnings.push("A word followed by a few digits is a very common pattern.");
    entropy *= 0.8;
  }
  if (password.length < 12) warnings.push("Use at least 12 characters.");

  const score = entropy < 28 ? 0 : entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4;
  const labels: StrengthLabel[] = ["very weak", "weak", "fair", "strong", "very strong"];
  return {
    entropyBits: entropy,
    label: labels[score] as StrengthLabel,
    score,
    warnings,
    crackTime: humanDuration(2 ** entropy / 2 / guessesPerSecond),
  };
}
