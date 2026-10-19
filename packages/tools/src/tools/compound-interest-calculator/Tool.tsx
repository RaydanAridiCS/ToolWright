"use client";

import { useMemo } from "react";
import { Alert, Field, Panel, ScrollArea, Select, Stat, StatGrid, useShareableState } from "@toolwright/ui";
import { compoundInterest } from "@toolwright/core/calc";
import { NumberField, num } from "../../shared/number-field";
import { formatMoney } from "../../shared/format";

export default function Tool() {
  const { state, setState } = useShareableState({ principal: "10000", rate: "7", years: "20", contribution: "250", compounds: "12" });
  const set = (key: keyof typeof state) => (value: string) => setState((s) => ({ ...s, [key]: value }));

  const result = useMemo(() => {
    const principal = num(state.principal);
    const rate = num(state.rate);
    const years = num(state.years);
    const contribution = state.contribution.trim() === "" ? 0 : num(state.contribution);
    if (![principal, rate, years, contribution].every(Number.isFinite) || principal < 0 || years <= 0 || years > 100 || rate < 0) return null;
    return compoundInterest({ principal, annualRatePercent: rate, years, compoundsPerYear: Number(state.compounds), contribution });
  }, [state]);

  const max = result ? Math.max(...result.byYear.map((y) => y.balance)) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField label="Initial deposit" suffix="$" value={state.principal} onChange={set("principal")} min={0} />
        <NumberField label="Contribution per period" suffix="$" value={state.contribution} onChange={set("contribution")} min={0} />
        <NumberField label="Annual rate" suffix="%" value={state.rate} onChange={set("rate")} min={0} />
        <NumberField label="Years" value={state.years} onChange={set("years")} min={1} max={100} />
        <Field label="Compounding (and contributions)">
          {(id) => (
            <Select id={id} value={state.compounds} onChange={(e) => set("compounds")(e.target.value)}>
              <option value="12">Monthly</option>
              <option value="4">Quarterly</option>
              <option value="2">Semi-annually</option>
              <option value="1">Annually</option>
              <option value="365">Daily</option>
            </Select>
          )}
        </Field>
      </div>

      {!result ? <Alert tone="warning">Enter valid numbers (term between 1 and 100 years).</Alert> : null}

      {result ? (
        <>
          <div className="rounded-xl border border-primary/30 bg-primary/8 p-5">
            <p className="text-sm text-muted-foreground">Future value</p>
            <p className="font-mono text-4xl font-semibold" data-testid="future-value">
              {formatMoney(result.finalBalance)}
            </p>
          </div>
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <Stat label="Total contributed" value={formatMoney(result.totalContributions)} />
            <Stat label="Interest earned" value={formatMoney(result.totalInterest)} />
            <Stat label="Growth" value={`${result.totalContributions > 0 ? ((result.totalInterest / result.totalContributions) * 100).toFixed(0) : 0}%`} />
          </StatGrid>
          <Panel title="Year by year">
            <ScrollArea label="Year-by-year balances" className="max-h-96 rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm tabular-nums">
                <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Year</th>
                    <th className="px-4 py-2 font-medium">Contributed</th>
                    <th className="px-4 py-2 font-medium">Interest</th>
                    <th className="w-1/3 px-4 py-2 text-left font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-[13px]">
                  {result.byYear.map((y) => (
                    <tr key={y.year}>
                      <td className="px-4 py-1.5 text-left">{y.year}</td>
                      <td className="px-4 py-1.5">{formatMoney(y.contributions)}</td>
                      <td className="px-4 py-1.5">{formatMoney(y.interest)}</td>
                      <td className="px-4 py-1.5 text-left">
                        <div className="flex items-center gap-2">
                          <span className="h-2 rounded-full bg-primary/70" style={{ width: `${Math.max(2, (y.balance / max) * 60)}%` }} />
                          {formatMoney(y.balance)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Panel>
          <p className="text-xs text-muted-foreground">Projections are illustrative and assume a constant rate of return. Real returns vary, and this is not financial advice.</p>
        </>
      ) : null}
    </div>
  );
}
