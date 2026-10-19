/** Calculators: percentages, number bases, Roman numerals, loans, interest, and more. */

export const percentOf = (percent: number, value: number) => (percent / 100) * value;
export const whatPercent = (part: number, whole: number) => (whole === 0 ? NaN : (part / whole) * 100);
export const percentChange = (from: number, to: number) => (from === 0 ? NaN : ((to - from) / Math.abs(from)) * 100);
export const increaseByPercent = (value: number, percent: number) => value * (1 + percent / 100);
export const decreaseByPercent = (value: number, percent: number) => value * (1 - percent / 100);

/* ------------------------------ Number bases ------------------------------ */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Convert an integer string between bases 2–36 with arbitrary precision. */
export function convertBase(value: string, fromBase: number, toBase: number): string {
  if (![fromBase, toBase].every((b) => Number.isInteger(b) && b >= 2 && b <= 36)) throw new RangeError("Bases must be integers between 2 and 36.");
  let text = value.trim().toLowerCase().replace(/[_\s]/g, "");
  if (!text) return "";
  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  const prefixes: Record<number, string> = { 2: "0b", 8: "0o", 16: "0x" };
  if (prefixes[fromBase] && text.startsWith(prefixes[fromBase] as string)) text = text.slice(2);
  let n = 0n;
  const from = BigInt(fromBase);
  for (const ch of text) {
    const d = DIGITS.indexOf(ch);
    if (d === -1 || d >= fromBase) throw new RangeError(`"${ch}" is not a valid base-${fromBase} digit.`);
    n = n * from + BigInt(d);
  }
  if (n === 0n) return "0";
  const to = BigInt(toBase);
  let out = "";
  while (n > 0n) {
    out = DIGITS[Number(n % to)] + out;
    n /= to;
  }
  return (negative ? "-" : "") + out;
}

/* ------------------------------ Roman numerals ------------------------------ */

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new RangeError("Roman numerals support whole numbers from 1 to 3999.");
  let out = "";
  for (const [value, symbol] of ROMAN) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

export function fromRoman(text: string): number {
  const s = text.trim().toUpperCase();
  if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s) || s === "") throw new RangeError("Not a valid Roman numeral.");
  let total = 0;
  let rest = s;
  for (const [value, symbol] of ROMAN) {
    while (rest.startsWith(symbol)) {
      total += value;
      rest = rest.slice(symbol.length);
    }
  }
  return total;
}

/* ------------------------------ Finance ------------------------------ */

export interface LoanResult {
  payment: number;
  totalPaid: number;
  totalInterest: number;
  schedule: { period: number; payment: number; interest: number; principal: number; balance: number }[];
}

export function loanPayment(principal: number, annualRatePercent: number, years: number, paymentsPerYear = 12): LoanResult {
  if (principal <= 0 || years <= 0) throw new RangeError("Principal and term must be positive.");
  const n = Math.round(years * paymentsPerYear);
  const r = annualRatePercent / 100 / paymentsPerYear;
  const payment = r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
  let balance = principal;
  const schedule: LoanResult["schedule"] = [];
  for (let period = 1; period <= n; period++) {
    const interest = balance * r;
    const principalPart = Math.min(balance, payment - interest);
    balance = Math.max(0, balance - principalPart);
    schedule.push({ period, payment, interest, principal: principalPart, balance: period === n ? 0 : balance });
  }
  const totalPaid = payment * n;
  return { payment, totalPaid, totalInterest: totalPaid - principal, schedule };
}

export interface CompoundResult {
  finalBalance: number;
  totalContributions: number;
  totalInterest: number;
  byYear: { year: number; balance: number; contributions: number; interest: number }[];
}

export function compoundInterest(options: {
  principal: number;
  annualRatePercent: number;
  years: number;
  compoundsPerYear?: number;
  /** Added at the end of each compounding period. */
  contribution?: number;
}): CompoundResult {
  const { principal, annualRatePercent, years, compoundsPerYear = 12, contribution = 0 } = options;
  const r = annualRatePercent / 100 / compoundsPerYear;
  let balance = principal;
  let contributions = principal;
  const byYear: CompoundResult["byYear"] = [];
  const totalPeriods = Math.round(years * compoundsPerYear);
  for (let p = 1; p <= totalPeriods; p++) {
    balance = balance * (1 + r) + contribution;
    contributions += contribution;
    if (p % compoundsPerYear === 0 || p === totalPeriods) {
      byYear.push({ year: Math.ceil(p / compoundsPerYear), balance, contributions, interest: balance - contributions });
    }
  }
  return { finalBalance: balance, totalContributions: contributions, totalInterest: balance - contributions, byYear };
}

export function splitBill(bill: number, tipPercent: number, people: number): { tip: number; total: number; perPerson: number; tipPerPerson: number } {
  if (people < 1) throw new RangeError("At least one person is required.");
  const tip = (bill * tipPercent) / 100;
  const total = bill + tip;
  return { tip, total, perPerson: total / people, tipPerPerson: tip / people };
}

/* ------------------------------ Number theory ------------------------------ */

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export const lcm = (a: number, b: number) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b));

export function primeFactors(n: number): number[] {
  if (!Number.isSafeInteger(n) || n < 2) throw new RangeError("Enter a whole number of 2 or more (up to 2^53).");
  const factors: number[] = [];
  let rest = n;
  for (let d = 2; d * d <= rest; d += d === 2 ? 1 : 2) {
    while (rest % d === 0) {
      factors.push(d);
      rest /= d;
    }
  }
  if (rest > 1) factors.push(rest);
  return factors;
}

export const isPrime = (n: number) => Number.isSafeInteger(n) && n >= 2 && primeFactors(n).length === 1;

/* ------------------------------ Number to words ------------------------------ */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n] as string);
  }
  return parts.join(" ");
}

/** English words for an integer (BigInt-safe, up to 999 quintillion). */
export function numberToWords(input: bigint | number | string): string {
  const n = typeof input === "bigint" ? input : BigInt(input);
  if (n === 0n) return "zero";
  if (n < 0n) return `minus ${numberToWords(-n)}`;
  const chunks: string[] = [];
  let rest = n;
  let scale = 0;
  while (rest > 0n) {
    const chunk = Number(rest % 1000n);
    if (chunk) chunks.unshift(`${below1000(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    rest /= 1000n;
    scale++;
    if (scale > SCALES.length && rest > 0n) throw new RangeError("Number is too large.");
  }
  return chunks.join(" ");
}
