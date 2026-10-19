"use client";

import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button, Field, Panel, Select, useShareableState } from "@toolwright/ui";
import { TEMPERATURE_UNITS, UNIT_CATEGORIES, convertTemperature, convertUnit, formatNumber, type TemperatureUnit } from "@toolwright/core/units";
import { NumberField, num } from "../../shared/number-field";
import { ResultRow } from "../../shared/result-row";

interface UiUnit {
  id: string;
  label: string;
  symbol: string;
}
interface UiCategory {
  id: string;
  label: string;
  units: UiUnit[];
}

const CATEGORIES: UiCategory[] = [
  ...UNIT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, units: c.units })),
  { id: "temperature", label: "Temperature", units: TEMPERATURE_UNITS },
];

function convert(category: string, value: number, from: string, to: string): number {
  return category === "temperature" ? convertTemperature(value, from as TemperatureUnit, to as TemperatureUnit) : convertUnit(value, category, from, to);
}

const DEFAULTS: Record<string, [string, string]> = {
  length: ["meter", "foot"],
  mass: ["kilogram", "pound"],
  volume: ["liter", "gallon"],
  temperature: ["celsius", "fahrenheit"],
  data: ["gigabyte", "megabyte"],
  speed: ["kilometer-per-hour", "mile-per-hour"],
};

export default function Tool() {
  const { state, setState } = useShareableState({ category: "length", value: "1", from: "meter", to: "foot" });
  const category = CATEGORIES.find((c) => c.id === state.category) ?? (CATEGORIES[0] as UiCategory);
  const value = num(state.value);

  const pickCategory = (id: string) => {
    const next = CATEGORIES.find((c) => c.id === id) as UiCategory;
    const [from, to] = DEFAULTS[id] ?? [next.units[0]?.id ?? "", next.units[1]?.id ?? ""];
    setState((s) => ({ ...s, category: id, from, to }));
  };

  const result = useMemo(() => {
    if (!Number.isFinite(value)) return null;
    try {
      return convert(category.id, value, state.from, state.to);
    } catch {
      return null;
    }
  }, [category.id, value, state.from, state.to]);

  const unitLabel = (id: string) => category.units.find((u) => u.id === id);

  return (
    <div className="flex flex-col gap-5">
      <Field label="Category">
        {(id) => (
          <Select id={id} value={category.id} onChange={(e) => pickCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid items-end gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto_1fr]">
        <NumberField label="Value" value={state.value} onChange={(v) => setState((s) => ({ ...s, value: v }))} />
        <Field label="From">
          {(id) => (
            <Select id={id} value={state.from} onChange={(e) => setState((s) => ({ ...s, from: e.target.value }))}>
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.symbol})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button variant="outline" size="icon" aria-label="Swap units" className="mb-0.5 justify-self-center" onClick={() => setState((s) => ({ ...s, from: s.to, to: s.from }))}>
          <ArrowLeftRight />
        </Button>
        <Field label="To">
          {(id) => (
            <Select id={id} value={state.to} onChange={(e) => setState((s) => ({ ...s, to: e.target.value }))}>
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.symbol})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/8 p-5" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {Number.isFinite(value) ? `${formatNumber(value)} ${unitLabel(state.from)?.symbol ?? ""} =` : "Enter a number"}
        </p>
        <p className="mt-1 break-all font-mono text-3xl font-semibold" data-testid="unit-result">
          {result === null ? "—" : `${formatNumber(result, 10)} ${unitLabel(state.to)?.symbol ?? ""}`}
        </p>
      </div>

      {Number.isFinite(value) ? (
        <Panel title={`${formatNumber(value)} ${unitLabel(state.from)?.symbol ?? ""} in every ${category.label.toLowerCase()} unit`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {category.units
              .filter((u) => u.id !== state.from)
              .map((u) => {
                let v: number | null = null;
                try {
                  v = convert(category.id, value, state.from, u.id);
                } catch {
                  v = null;
                }
                return <ResultRow key={u.id} label={u.label} value={v === null ? "" : `${formatNumber(v, 10)} ${u.symbol}`} />;
              })}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
