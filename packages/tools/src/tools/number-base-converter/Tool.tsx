"use client";

import { useMemo } from "react";
import { Alert, Field, Input, Select, useShareableState } from "@toolwright/ui";
import { convertBase } from "@toolwright/core/calc";
import { ResultRow } from "../../shared/result-row";
import { errorMessage } from "../../shared/format";

const COMMON = [
  { base: 2, label: "Binary (2)" },
  { base: 8, label: "Octal (8)" },
  { base: 10, label: "Decimal (10)" },
  { base: 16, label: "Hexadecimal (16)" },
  { base: 32, label: "Base 32" },
  { base: 36, label: "Base 36" },
];

export default function Tool() {
  const { state, setState } = useShareableState({ value: "255", base: 10, custom: 7 });

  const result = useMemo(() => {
    if (!state.value.trim()) return null;
    try {
      const rows = COMMON.map((c) => ({ label: c.label, value: convertBase(state.value, state.base, c.base) }));
      rows.push({ label: `Base ${state.custom}`, value: convertBase(state.value, state.base, state.custom) });
      return { ok: true as const, rows };
    } catch (err) {
      return { ok: false as const, error: errorMessage(err) };
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_14rem_10rem]">
        <Field label="Number">{(id) => <Input id={id} mono value={state.value} onChange={(e) => setState((s) => ({ ...s, value: e.target.value }))} />}</Field>
        <Field label="Input base">
          {(id) => (
            <Select id={id} value={String(state.base)} onChange={(e) => setState((s) => ({ ...s, base: Number(e.target.value) }))}>
              {COMMON.map((c) => (
                <option key={c.base} value={c.base}>
                  {c.label}
                </option>
              ))}
              {[3, 4, 5, 6, 7, 9, 11, 12].map((b) => (
                <option key={b} value={b}>
                  Base {b}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Custom output base">
          {(id) => <Input id={id} type="number" min={2} max={36} value={state.custom} onChange={(e) => setState((s) => ({ ...s, custom: Math.min(36, Math.max(2, Number(e.target.value) || 2)) }))} />}
        </Field>
      </div>
      {result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}
      {result?.ok ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {result.rows.map((r) => (
            <ResultRow key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
