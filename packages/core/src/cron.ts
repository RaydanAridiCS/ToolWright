/** Cron expression explanation and next-run calculation (standard 5-field cron). */

import cronstrue from "cronstrue";

export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronError";
  }
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
  nameOffset?: number;
}

const FIELDS: FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTHS, nameOffset: 1 },
  { name: "day of week", min: 0, max: 7, names: DAYS, nameOffset: 0 },
];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseField(raw: string, spec: FieldSpec): { values: Set<number>; restricted: boolean } {
  const values = new Set<number>();
  const toNumber = (token: string): number => {
    const upper = token.toUpperCase();
    if (spec.names) {
      const idx = spec.names.indexOf(upper);
      if (idx !== -1) return idx + (spec.nameOffset ?? 0);
    }
    if (!/^\d+$/.test(token)) throw new CronError(`Invalid value "${token}" in ${spec.name} field.`);
    return Number(token);
  };
  let restricted = true;
  for (const part of raw.split(",")) {
    if (part === "") throw new CronError(`Empty list item in ${spec.name} field.`);
    const [range = "", stepText] = part.split("/") as [string, string | undefined];
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new CronError(`Invalid step "${stepText}" in ${spec.name} field.`);
    let lo: number;
    let hi: number;
    if (range === "*" || range === "?") {
      lo = spec.min;
      hi = spec.max === 7 ? 6 : spec.max;
      if (step === 1) restricted = false;
    } else if (range.includes("-")) {
      const [a = "", b = ""] = range.split("-");
      lo = toNumber(a);
      hi = toNumber(b);
    } else {
      lo = toNumber(range);
      hi = stepText === undefined ? lo : spec.max === 7 ? 6 : spec.max;
    }
    if (lo < spec.min || hi > spec.max || lo > hi) throw new CronError(`Value out of range in ${spec.name} field (${spec.min}-${spec.max}).`);
    for (let v = lo; v <= hi; v += step) values.add(spec.max === 7 && v === 7 ? 0 : v);
  }
  return { values, restricted };
}

export function parseCron(expression: string): ParsedCron {
  const normalized = MACROS[expression.trim().toLowerCase()] ?? expression.trim();
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) throw new CronError(`Expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}.`);
  const [min, hour, dom, mon, dow] = parts.map((p, i) => parseField(p, FIELDS[i] as FieldSpec)) as [
    ReturnType<typeof parseField>,
    ReturnType<typeof parseField>,
    ReturnType<typeof parseField>,
    ReturnType<typeof parseField>,
    ReturnType<typeof parseField>,
  ];
  return {
    minutes: min.values,
    hours: hour.values,
    daysOfMonth: dom.values,
    months: mon.values,
    daysOfWeek: dow.values,
    domRestricted: dom.restricted,
    dowRestricted: dow.restricted,
  };
}

export function explainCron(expression: string, options: { use24Hour?: boolean } = {}): string {
  parseCron(expression);
  const normalized = MACROS[expression.trim().toLowerCase()] ?? expression.trim();
  return cronstrue.toString(normalized, { use24HourTimeFormat: options.use24Hour ?? true, throwExceptionOnParseError: true });
}

/**
 * Next run times after `from`. Standard cron semantics: when both day-of-month and
 * day-of-week are restricted, a day matches if either does.
 */
export function nextRuns(expression: string, count = 5, from: Date = new Date(), options: { utc?: boolean } = {}): Date[] {
  const cron = parseCron(expression);
  const utc = options.utc ?? true;
  const get = (d: Date) =>
    utc
      ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }
      : { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), dow: d.getDay() };
  const make = (y: number, mo: number, d: number, h = 0, mi = 0) => (utc ? new Date(Date.UTC(y, mo, d, h, mi)) : new Date(y, mo, d, h, mi));

  const results: Date[] = [];
  let cursor = new Date(Math.floor(from.getTime() / 60000) * 60000 + 60000);
  const limit = from.getTime() + 8 * 366 * 86400000; // search up to ~8 years (covers Feb 29)
  while (results.length < count && cursor.getTime() <= limit) {
    const p = get(cursor);
    if (!cron.months.has(p.mo + 1)) {
      cursor = make(p.y, p.mo + 1, 1);
      continue;
    }
    const domOk = cron.daysOfMonth.has(p.d);
    const dowOk = cron.daysOfWeek.has(p.dow);
    const dayOk = cron.domRestricted && cron.dowRestricted ? domOk || dowOk : domOk && dowOk;
    if (!dayOk) {
      cursor = make(p.y, p.mo, p.d + 1);
      continue;
    }
    if (!cron.hours.has(p.h)) {
      cursor = make(p.y, p.mo, p.d, p.h + 1);
      continue;
    }
    if (!cron.minutes.has(p.mi)) {
      cursor = new Date(cursor.getTime() + 60000);
      continue;
    }
    results.push(cursor);
    cursor = new Date(cursor.getTime() + 60000);
  }
  return results;
}

export const CRON_EXAMPLES: { expression: string; label: string }[] = [
  { expression: "* * * * *", label: "Every minute" },
  { expression: "*/15 * * * *", label: "Every 15 minutes" },
  { expression: "0 * * * *", label: "Every hour" },
  { expression: "0 9 * * 1-5", label: "Weekdays at 9:00" },
  { expression: "30 2 * * *", label: "Every day at 02:30" },
  { expression: "0 0 1 * *", label: "First day of each month" },
  { expression: "0 0 * * 0", label: "Every Sunday at midnight" },
  { expression: "0 12 1 1 *", label: "Every New Year's Day at noon" },
];
