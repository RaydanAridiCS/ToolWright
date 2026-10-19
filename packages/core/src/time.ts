/** Dates, timestamps and time zones. Uses Intl only; no external data. */

export type TimestampUnit = "seconds" | "milliseconds" | "microseconds" | "nanoseconds";

export interface ParsedTimestamp {
  date: Date;
  /** Unit that was detected when the input was a bare number. */
  unit?: TimestampUnit;
}

/** Parse a Unix timestamp (any common unit) or a date string. Returns null if it cannot be parsed. */
export function parseTimestamp(input: string): ParsedTimestamp | null {
  const text = input.trim();
  if (!text) return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    const abs = Math.abs(n);
    let unit: TimestampUnit;
    let ms: number;
    if (abs < 1e11) {
      unit = "seconds";
      ms = n * 1000;
    } else if (abs < 1e14) {
      unit = "milliseconds";
      ms = n;
    } else if (abs < 1e17) {
      unit = "microseconds";
      ms = n / 1000;
    } else {
      unit = "nanoseconds";
      ms = n / 1e6;
    }
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : { date, unit };
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : { date };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

/** Offset of a time zone from UTC at the given instant, in minutes (east is positive). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Format an instant as `YYYY-MM-DD HH:mm:ss` in a time zone. */
export function formatInZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Convert wall-clock fields in `timeZone` into the matching instant. */
export function zonedTimeToDate(
  fields: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = fields;
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Re-check around DST transitions.
  const corrected = guess - tzOffsetMinutes(new Date(instant), timeZone) * 60000;
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** Parse `YYYY-MM-DD[ T]HH:mm[:ss]` as wall-clock time in a zone. */
export function parseWallClock(input: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return zonedTimeToDate(
    { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h ?? 0), minute: Number(mi ?? 0), second: Number(s ?? 0) },
    timeZone,
  );
}

export function listTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(date: Date, now: Date = new Date(), locale = "en"): string {
  const diff = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= seconds || unit === "second") return rtf.format(Math.trunc(diff / seconds), unit);
  }
  return rtf.format(0, "second");
}

export interface DateDescription {
  iso: string;
  utc: string;
  rfc2822: string;
  unixSeconds: number;
  unixMilliseconds: number;
  relative: string;
  dayOfYear: number;
  isoWeek: number;
  isLeapYear: boolean;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

/** ISO-8601 week number (UTC). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function describeDate(date: Date, now: Date = new Date()): DateDescription {
  return {
    iso: date.toISOString(),
    utc: date.toUTCString(),
    rfc2822: date.toUTCString().replace("GMT", "+0000"),
    unixSeconds: Math.floor(date.getTime() / 1000),
    unixMilliseconds: date.getTime(),
    relative: relativeTime(date, now),
    dayOfYear: dayOfYear(date),
    isoWeek: isoWeek(date),
    isLeapYear: isLeapYear(date.getUTCFullYear()),
  };
}

export interface DateDifference {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  weeks: number;
  /** `true` when `end` is before `start`. */
  negative: boolean;
}

/** Calendar difference in UTC. Components are non-negative; see `negative` for direction. */
export function dateDifference(a: Date, b: Date): DateDifference {
  const negative = b.getTime() < a.getTime();
  const [start, end] = negative ? [b, a] : [a, b];
  // Walk forward from `start` by whole months (clamping month ends), then count the leftover days.
  let totalMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  let anchor = addToDate(start, { months: totalMonths });
  if (anchor.getTime() > end.getTime()) {
    totalMonths -= 1;
    anchor = addToDate(start, { months: totalMonths });
  }
  const ms = end.getTime() - start.getTime();
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: Math.floor((end.getTime() - anchor.getTime()) / 86400000),
    totalDays: Math.floor(ms / 86400000),
    weeks: Math.floor(ms / (7 * 86400000)),
    totalHours: Math.floor(ms / 3600000),
    totalMinutes: Math.floor(ms / 60000),
    totalSeconds: Math.floor(ms / 1000),
    negative,
  };
}

export interface AgeResult extends DateDifference {
  nextBirthday: string;
  daysUntilBirthday: number;
}

export function calculateAge(birth: Date, now: Date = new Date()): AgeResult {
  const diff = dateDifference(birth, now);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate());
  if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate());
  return { ...diff, nextBirthday: new Date(next).toISOString().slice(0, 10), daysUntilBirthday: Math.round((next - today) / 86400000) };
}

export interface DateAdjustment {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

/** Add (or subtract, with negatives) calendar units to a date in UTC. Month ends clamp (Jan 31 + 1 month = Feb 28/29). */
export function addToDate(date: Date, adj: DateAdjustment): Date {
  const d = new Date(date.getTime());
  const totalMonths = (adj.years ?? 0) * 12 + (adj.months ?? 0);
  if (totalMonths) {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + totalMonths);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  d.setTime(
    d.getTime() +
      ((adj.weeks ?? 0) * 7 + (adj.days ?? 0)) * 86400000 +
      (adj.hours ?? 0) * 3600000 +
      (adj.minutes ?? 0) * 60000 +
      (adj.seconds ?? 0) * 1000,
  );
  return d;
}

/** Count weekdays (Mon–Fri) between two dates, inclusive of start, exclusive of end. */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const step = s <= e ? 86400000 : -86400000;
  for (let t = s; step > 0 ? t < e : t > e; t += step) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return step > 0 ? count : -count;
}
