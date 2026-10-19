import { describe, expect, it } from "vitest";
import {
  addToDate,
  businessDaysBetween,
  calculateAge,
  dateDifference,
  describeDate,
  formatInZone,
  formatOffset,
  isLeapYear,
  isoWeek,
  parseTimestamp,
  parseWallClock,
  relativeTime,
  tzOffsetMinutes,
  zonedTimeToDate,
} from "../src/time";
import { CronError, explainCron, nextRuns, parseCron } from "../src/cron";
import { replaceRegex, testRegex } from "../src/regex";
import { locateJsonError } from "../src/json";
import { escapeString } from "../src/encoding";

describe("parseTimestamp", () => {
  it("detects the unit of numeric timestamps", () => {
    expect(parseTimestamp("1700000000")).toMatchObject({ unit: "seconds" });
    expect(parseTimestamp("1700000000000")?.unit).toBe("milliseconds");
    expect(parseTimestamp("1700000000000000")?.unit).toBe("microseconds");
    expect(parseTimestamp("1700000000000000000")?.unit).toBe("nanoseconds");
    expect(parseTimestamp("1700000000")?.date.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(parseTimestamp("1700000000000")?.date.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });
  it("parses date strings and rejects nonsense", () => {
    expect(parseTimestamp("2026-10-19T12:00:00Z")?.date.getTime()).toBe(Date.UTC(2026, 9, 19, 12));
    expect(parseTimestamp("not a date")).toBeNull();
    expect(parseTimestamp("  ")).toBeNull();
  });
  it("supports negative timestamps", () => {
    expect(parseTimestamp("-86400")?.date.toISOString()).toBe("1969-12-31T00:00:00.000Z");
  });
});

describe("time zones", () => {
  const winter = new Date("2026-01-15T12:00:00Z");
  const summer = new Date("2026-07-15T12:00:00Z");
  it("computes offsets including DST", () => {
    expect(tzOffsetMinutes(winter, "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(summer, "America/New_York")).toBe(-240);
    expect(tzOffsetMinutes(winter, "Asia/Kolkata")).toBe(330);
    expect(tzOffsetMinutes(winter, "UTC")).toBe(0);
  });
  it("formats offsets", () => {
    expect(formatOffset(330)).toBe("+05:30");
    expect(formatOffset(-300)).toBe("-05:00");
  });
  it("formats an instant in a zone", () => {
    expect(formatInZone(winter, "Asia/Tokyo")).toBe("2026-01-15 21:00:00");
  });
  it("converts wall-clock time in a zone back to an instant", () => {
    expect(zonedTimeToDate({ year: 2026, month: 7, day: 15, hour: 8 }, "America/New_York").toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(parseWallClock("2026-01-15 21:00", "Asia/Tokyo")?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(parseWallClock("garbage", "UTC")).toBeNull();
  });
});

describe("date helpers", () => {
  it("describes a date", () => {
    const d = describeDate(new Date("2024-02-29T10:00:00Z"), new Date("2024-03-01T10:00:00Z"));
    expect(d).toMatchObject({ iso: "2024-02-29T10:00:00.000Z", unixSeconds: 1709200800, dayOfYear: 60, isLeapYear: true, relative: "yesterday" });
  });
  it("knows leap years and ISO weeks", () => {
    expect([1900, 2000, 2024, 2026].map(isLeapYear)).toEqual([false, true, true, false]);
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe(1);
    expect(isoWeek(new Date("2020-12-31T00:00:00Z"))).toBe(53);
    expect(isoWeek(new Date("2021-01-03T00:00:00Z"))).toBe(53);
  });
  it("formats relative times", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(relativeTime(new Date("2026-01-01T03:00:00Z"), now)).toBe("in 3 hours");
    expect(relativeTime(new Date("2025-12-30T00:00:00Z"), now)).toBe("2 days ago");
  });
  it("computes calendar differences", () => {
    const diff = dateDifference(new Date("2020-01-31T00:00:00Z"), new Date("2026-03-01T00:00:00Z"));
    expect(diff).toMatchObject({ years: 6, months: 1, days: 1, negative: false });
    expect(dateDifference(new Date("2026-01-02T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toMatchObject({ days: 1, totalDays: 1, negative: true });
  });
  it("calculates age and the next birthday", () => {
    const age = calculateAge(new Date("1990-05-20T00:00:00Z"), new Date("2026-05-19T12:00:00Z"));
    expect(age).toMatchObject({ years: 35, months: 11, nextBirthday: "2026-05-20", daysUntilBirthday: 1 });
  });
  it("adds calendar units and clamps month ends", () => {
    expect(addToDate(new Date("2026-01-31T00:00:00Z"), { months: 1 }).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addToDate(new Date("2024-01-31T00:00:00Z"), { months: 1 }).toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(addToDate(new Date("2026-01-01T00:00:00Z"), { years: 1, weeks: 1, hours: 2 }).toISOString()).toBe("2027-01-08T02:00:00.000Z");
    expect(addToDate(new Date("2026-03-01T00:00:00Z"), { days: -1 }).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
  it("counts business days", () => {
    // Mon 2026-10-19 → Mon 2026-10-26 = 5 weekdays
    expect(businessDaysBetween(new Date("2026-10-19T00:00:00Z"), new Date("2026-10-26T00:00:00Z"))).toBe(5);
    expect(businessDaysBetween(new Date("2026-10-26T00:00:00Z"), new Date("2026-10-19T00:00:00Z"))).toBe(-5);
  });
});

describe("cron", () => {
  it("explains expressions", () => {
    expect(explainCron("*/15 * * * *")).toMatch(/every 15 minutes/i);
    expect(explainCron("0 9 * * 1-5")).toMatch(/09:00.*Monday through Friday/i);
    expect(explainCron("@daily")).toMatch(/00:00/);
  });
  it("validates fields", () => {
    expect(() => parseCron("* * * *")).toThrow(CronError);
    expect(() => parseCron("61 * * * *")).toThrow(/out of range/);
    expect(() => parseCron("a * * * *")).toThrow(CronError);
    expect(() => parseCron("*/0 * * * *")).toThrow(/step/);
  });
  it("parses lists, ranges, steps and names", () => {
    const c = parseCron("0,30 8-10 1,15 JAN-MAR MON,FRI");
    expect([...c.minutes]).toEqual([0, 30]);
    expect([...c.hours]).toEqual([8, 9, 10]);
    expect([...c.months]).toEqual([1, 2, 3]);
    expect([...c.daysOfWeek].sort()).toEqual([1, 5]);
    expect(parseCron("0 0 * * 7").daysOfWeek.has(0)).toBe(true);
  });
  it("computes upcoming runs in UTC", () => {
    const from = new Date("2026-10-19T10:07:00Z");
    expect(nextRuns("*/15 * * * *", 3, from).map((d) => d.toISOString())).toEqual([
      "2026-10-19T10:15:00.000Z",
      "2026-10-19T10:30:00.000Z",
      "2026-10-19T10:45:00.000Z",
    ]);
    expect(nextRuns("30 2 * * *", 2, from).map((d) => d.toISOString())).toEqual(["2026-10-20T02:30:00.000Z", "2026-10-21T02:30:00.000Z"]);
  });
  it("honours weekday restrictions", () => {
    const runs = nextRuns("0 9 * * 1-5", 3, new Date("2026-10-23T10:00:00Z")); // Friday after 9:00
    expect(runs.map((d) => d.toISOString())).toEqual(["2026-10-26T09:00:00.000Z", "2026-10-27T09:00:00.000Z", "2026-10-28T09:00:00.000Z"]);
  });
  it("uses OR semantics when both day-of-month and day-of-week are restricted", () => {
    const runs = nextRuns("0 0 13 * 5", 4, new Date("2026-10-01T00:00:00Z"));
    const days = runs.map((d) => d.toISOString().slice(0, 10));
    expect(days).toEqual(["2026-10-02", "2026-10-09", "2026-10-13", "2026-10-16"]);
  });
  it("finds leap-day schedules", () => {
    expect(nextRuns("0 0 29 2 *", 1, new Date("2026-03-01T00:00:00Z"))[0]?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("regex tester", () => {
  it("returns matches with positions, groups and named groups", () => {
    const result = testRegex("(?<y>\\d{4})-(\\d{2})", "g", "on 2026-10 and 2027-01");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matches).toHaveLength(2);
      expect(result.matches[0]).toMatchObject({ match: "2026-10", index: 3, end: 10, line: 1, column: 4, groups: ["2026", "10"], named: { y: "2026" } });
    }
  });
  it("tracks line and column across lines", () => {
    const result = testRegex("b", "g", "a\nab\nb");
    expect(result.ok && result.matches.map((m) => [m.line, m.column])).toEqual([[2, 2], [3, 1]]);
  });
  it("always iterates globally and handles empty matches", () => {
    const result = testRegex("a*", "", "baab");
    expect(result.ok && result.matches.length).toBe(4);
  });
  it("reports invalid patterns", () => {
    const result = testRegex("(", "g", "x");
    expect(result.ok).toBe(false);
  });
  it("returns nothing for an empty pattern and truncates at the limit", () => {
    expect(testRegex("", "g", "abc")).toMatchObject({ ok: true, matches: [] });
    const r = testRegex(".", "g", "x".repeat(50), 10);
    expect(r.ok && r.truncated).toBe(true);
  });
  it("replaces with capture references", () => {
    expect(replaceRegex("(\\w+)@(\\w+)", "g", "a@b c@d", "$2@$1")).toEqual({ ok: true, output: "b@a d@c" });
    expect(replaceRegex("(", "g", "x", "y").ok).toBe(false);
  });
});

describe("locateJsonError", () => {
  it("returns null for valid documents", () => {
    for (const ok of ["{}", "[]", '"x"', "1.5e3", "true", "null", ' {"a" : [1, {"b": "c\\u0041\\n"}] } ']) expect(locateJsonError(ok)).toBeNull();
  });
  it.each([
    ["", 0],
    ["{", 1],
    ['{"a" 1}', 5],
    ["[1,]", 3],
    ['{"a":1,}', 7],
    ["{'a':1}", 1],
    ["tru", 0],
    ['"abc', 4],
    ["01", 1],
    ['"\\x"', 1],
    ["[1] 2", 4],
  ])("pinpoints the error in %j", (text, position) => {
    expect(locateJsonError(text)?.position).toBe(position);
  });
});

describe("line separators in escaped strings", () => {
  it("escapes U+2028 and U+2029 for JavaScript", () => {
    expect(escapeString("a b c", "javascript")).toBe("a\\u2028b\\u2029c");
  });
});
