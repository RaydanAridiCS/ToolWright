"use client";

import { useMemo } from "react";
import { Alert, Field, Input, Panel, SegmentedControl, Stat, StatGrid, useShareableState } from "@toolwright/ui";
import { addToDate, businessDaysBetween, calculateAge, dateDifference } from "@toolwright/core/time";
import { NumberField, num } from "../../shared/number-field";
import { formatInt, pluralize } from "../../shared/format";

type Mode = "difference" | "add" | "age" | "business";

const today = () => new Date().toISOString().slice(0, 10);
const parseDay = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default function Tool() {
  const { state, setState } = useShareableState({ mode: "difference" as Mode, start: "2026-01-01", end: "2026-12-31", base: "2026-10-19", years: "0", months: "1", days: "0", direction: "add" as "add" | "subtract", birth: "1990-05-20" });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const start = parseDay(state.start);
  const end = parseDay(state.end);
  const base = parseDay(state.base);
  const birth = parseDay(state.birth);

  const diff = useMemo(() => (start && end ? dateDifference(start, end) : null), [start, end]);
  const business = useMemo(() => (start && end ? businessDaysBetween(start, end) : null), [start, end]);
  const added = useMemo(() => {
    if (!base) return null;
    const sign = state.direction === "add" ? 1 : -1;
    return addToDate(base, { years: sign * (num(state.years) || 0), months: sign * (num(state.months) || 0), days: sign * (num(state.days) || 0) });
  }, [base, state.years, state.months, state.days, state.direction]);
  const age = useMemo(() => (birth ? calculateAge(birth, parseDay(today()) ?? new Date()) : null), [birth]);

  const dateField = (label: string, key: "start" | "end" | "base" | "birth") => (
    <Field label={label}>{(id) => <Input id={id} type="date" value={state[key]} onChange={(e) => set({ [key]: e.target.value })} />}</Field>
  );

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label="Calculation"
        value={state.mode}
        onValueChange={(mode) => set({ mode })}
        options={[
          { value: "difference", label: "Difference" },
          { value: "add", label: "Add / subtract" },
          { value: "age", label: "Age" },
          { value: "business", label: "Business days" },
        ]}
      />

      {state.mode === "difference" || state.mode === "business" ? (
        <>
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            {dateField("Start date", "start")}
            {dateField("End date", "end")}
          </div>
          {state.mode === "difference" && diff ? (
            <Panel title={diff.negative ? "End is before start" : "Difference"}>
              <p className="text-2xl font-semibold">
                {pluralize(diff.years, "year")}, {pluralize(diff.months, "month")}, {pluralize(diff.days, "day")}
              </p>
              <StatGrid>
                <Stat label="Total days" value={formatInt(diff.totalDays)} />
                <Stat label="Weeks" value={formatInt(diff.weeks)} />
                <Stat label="Hours" value={formatInt(diff.totalHours)} />
                <Stat label="Minutes" value={formatInt(diff.totalMinutes)} />
              </StatGrid>
            </Panel>
          ) : null}
          {state.mode === "business" && business !== null ? (
            <Panel title="Business days (Mon–Fri)">
              <p className="text-3xl font-semibold tabular-nums">{formatInt(business)}</p>
              <p className="text-sm text-muted-foreground">Counts weekdays from the start date up to, but not including, the end date. Public holidays are not excluded.</p>
            </Panel>
          ) : null}
          {!start || !end ? <Alert tone="warning">Choose both dates.</Alert> : null}
        </>
      ) : null}

      {state.mode === "add" ? (
        <>
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
            {dateField("Start date", "base")}
            <Field label="Operation">
              {(id) => (
                <select id={id} value={state.direction} onChange={(e) => set({ direction: e.target.value as "add" | "subtract" })} className="h-10 rounded-lg border border-border bg-card px-3 text-sm">
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                </select>
              )}
            </Field>
            <NumberField label="Years" value={state.years} onChange={(years) => set({ years })} />
            <NumberField label="Months" value={state.months} onChange={(months) => set({ months })} />
            <NumberField label="Days" value={state.days} onChange={(days) => set({ days })} />
          </div>
          {added ? (
            <Panel title="Result">
              <p className="text-2xl font-semibold">{fmtDay(added)}</p>
              <p className="font-mono text-sm text-muted-foreground">{added.toISOString().slice(0, 10)}</p>
            </Panel>
          ) : (
            <Alert tone="warning">Choose a start date.</Alert>
          )}
        </>
      ) : null}

      {state.mode === "age" ? (
        <>
          <div className="rounded-xl border border-border bg-card p-4 sm:max-w-sm">{dateField("Date of birth", "birth")}</div>
          {age && !age.negative ? (
            <Panel title="Age">
              <p className="text-2xl font-semibold">
                {pluralize(age.years, "year")}, {pluralize(age.months, "month")}, {pluralize(age.days, "day")}
              </p>
              <StatGrid>
                <Stat label="Total days" value={formatInt(age.totalDays)} />
                <Stat label="Total weeks" value={formatInt(age.weeks)} />
                <Stat label="Next birthday" value={age.nextBirthday} />
                <Stat label="Days to go" value={formatInt(age.daysUntilBirthday)} />
              </StatGrid>
            </Panel>
          ) : (
            <Alert tone="warning">Enter a date of birth in the past.</Alert>
          )}
        </>
      ) : null}
    </div>
  );
}
