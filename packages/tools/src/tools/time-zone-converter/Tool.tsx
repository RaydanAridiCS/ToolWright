"use client";

import { useEffect, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { Alert, Button, Field, Input, Panel, Select, useShareableState } from "@toolwright/ui";
import { formatInZone, formatOffset, listTimeZones, parseWallClock, tzOffsetMinutes, zonedParts } from "@toolwright/core/time";

const DEFAULT_ZONES = ["UTC", "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

export default function Tool() {
  const { state, setState } = useShareableState({ when: "", source: "UTC", targets: DEFAULT_ZONES });
  const zones = useMemo(() => listTimeZones(), []);

  // Default to "now" in the visitor's own zone (client-only to keep server and client HTML identical).
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setState((s) => {
      if (s.when) return s;
      const p = zonedParts(new Date(), zone);
      const pad = (n: number) => String(n).padStart(2, "0");
      return { ...s, source: zone, when: `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`, targets: s.targets.includes(zone) ? s.targets : [zone, ...s.targets] };
    });
  }, [setState]);

  const instant = useMemo(() => (state.when ? parseWallClock(state.when, state.source) : null), [state.when, state.source]);
  const available = zones.filter((z) => !state.targets.includes(z));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Date and time">{(id) => <Input id={id} type="datetime-local" value={state.when} onChange={(e) => setState((s) => ({ ...s, when: e.target.value }))} />}</Field>
        <Field label="In time zone">
          {(id) => (
            <Select id={id} value={state.source} onChange={(e) => setState((s) => ({ ...s, source: e.target.value }))}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {!instant && state.when ? <Alert tone="error">That date could not be read.</Alert> : null}

      {instant ? (
        <Panel
          title="Equivalent times"
          actions={
            <Select
              aria-label="Add a time zone"
              value=""
              onChange={(e) => e.target.value && setState((s) => ({ ...s, targets: [...s.targets, e.target.value] }))}
              className="h-8 w-52 text-[13px]"
            >
              <option value="">+ Add a zone…</option>
              {available.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          }
        >
          <ul className="grid gap-2 md:grid-cols-2">
            {state.targets.map((zone) => {
              const parts = zonedParts(instant, zone);
              const sourceDay = zonedParts(instant, state.source);
              const dayShift = Date.UTC(parts.year, parts.month - 1, parts.day) - Date.UTC(sourceDay.year, sourceDay.month - 1, sourceDay.day);
              const days = Math.round(dayShift / 86400000);
              return (
                <li key={zone} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{zone.replace(/_/g, " ")}</p>
                    <p className="font-mono text-lg tabular-nums">{formatInZone(instant, zone)}</p>
                    <p className="text-xs text-muted-foreground">
                      UTC{formatOffset(tzOffsetMinutes(instant, zone))}
                      {days !== 0 ? ` · ${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${zone}`} className="size-8" onClick={() => setState((s) => ({ ...s, targets: s.targets.filter((z) => z !== zone) }))}>
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
          {state.targets.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Plus className="size-4" /> Add a time zone to compare.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
