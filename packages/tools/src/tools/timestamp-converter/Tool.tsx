"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Input, Panel, Select, useShareableState } from "@toolwright/ui";
import { describeDate, formatInZone, formatOffset, listTimeZones, parseTimestamp, parseWallClock, tzOffsetMinutes } from "@toolwright/core/time";
import { ResultRow } from "../../shared/result-row";

export default function Tool() {
  const { state, setState } = useShareableState({ input: "", zone: "UTC", wall: "" });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const [now, setNow] = useState<number | null>(null);
  const zones = useMemo(() => listTimeZones(), []);

  // Clock and browser zone are client-only to avoid hydration mismatches.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone) setState((s) => (s.zone === "UTC" ? { ...s, zone: browserZone } : s));
  }, [setState]);

  const parsed = useMemo(() => parseTimestamp(state.input), [state.input]);
  const info = useMemo(() => (parsed ? describeDate(parsed.date) : null), [parsed]);
  const fromWall = useMemo(() => (state.wall ? parseWallClock(state.wall, state.zone) : null), [state.wall, state.zone]);
  const wallInfo = fromWall ? describeDate(fromWall) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-foreground bg-card px-5 py-4 shadow-md">
        <div>
          <p className="label-plate">Current Unix time</p>
          <p className="font-display text-4xl font-bold tabular-nums" aria-live="off">
            {now === null ? "…" : Math.floor(now / 1000)}
          </p>
        </div>
        <Button variant="outline" onClick={() => set({ input: String(Math.floor(Date.now() / 1000)) })}>
          Use current time
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <Field label="Timestamp or date" hint="Seconds, milliseconds, microseconds, nanoseconds, or a date like 2026-10-19T12:00:00Z.">
          {(id) => <Input id={id} mono value={state.input} onChange={(e) => set({ input: e.target.value })} placeholder="1760875200" />}
        </Field>
        <Field label="Time zone">
          {(id) => (
            <Select id={id} value={state.zone} onChange={(e) => set({ zone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {state.input.trim() && !parsed ? <Alert tone="error">Could not read that as a timestamp or date.</Alert> : null}

      {parsed && info ? (
        <Panel title="Result" actions={parsed.unit ? <Badge tone="primary">Detected: {parsed.unit}</Badge> : null}>
          <div className="grid gap-3 md:grid-cols-2">
            <ResultRow label={`In ${state.zone}`} value={`${formatInZone(parsed.date, state.zone)} (UTC${formatOffset(tzOffsetMinutes(parsed.date, state.zone))})`} />
            <ResultRow label="ISO 8601 (UTC)" value={info.iso} />
            <ResultRow label="Your local time" value={parsed.date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })} mono={false} />
            <ResultRow label="Relative" value={info.relative} mono={false} />
            <ResultRow label="Unix (seconds)" value={String(info.unixSeconds)} />
            <ResultRow label="Unix (milliseconds)" value={String(info.unixMilliseconds)} />
            <ResultRow label="RFC 2822" value={info.rfc2822} />
            <ResultRow label="Day of year / ISO week" value={`Day ${info.dayOfYear}, week ${info.isoWeek}${info.isLeapYear ? " (leap year)" : ""}`} mono={false} />
          </div>
        </Panel>
      ) : null}

      <Panel title="Date to timestamp">
        <Field label={`Date and time in ${state.zone}`}>
          {(id) => <Input id={id} type="datetime-local" step={1} value={state.wall} onChange={(e) => set({ wall: e.target.value })} />}
        </Field>
        {wallInfo ? (
          <div className="grid gap-3 md:grid-cols-2">
            <ResultRow label="Unix (seconds)" value={String(wallInfo.unixSeconds)} />
            <ResultRow label="Unix (milliseconds)" value={String(wallInfo.unixMilliseconds)} />
            <ResultRow label="ISO 8601 (UTC)" value={wallInfo.iso} />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
