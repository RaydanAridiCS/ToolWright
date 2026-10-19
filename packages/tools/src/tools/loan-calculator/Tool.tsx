"use client";

import { useMemo, useState } from "react";
import { Alert, Button, DownloadButton, Field, Panel, ScrollArea, Select, Stat, StatGrid, useShareableState, ResultSlab } from "@toolwright/ui";
import { loanPayment } from "@toolwright/core/calc";
import { NumberField, num } from "../../shared/number-field";
import { formatMoney } from "../../shared/format";

export default function Tool() {
  const { state, setState } = useShareableState({ amount: "250000", rate: "6.5", years: "30", frequency: "12" });
  const set = (key: keyof typeof state) => (value: string) => setState((s) => ({ ...s, [key]: value }));
  const [showAll, setShowAll] = useState(false);

  const result = useMemo(() => {
    const amount = num(state.amount);
    const rate = num(state.rate);
    const years = num(state.years);
    if (![amount, rate, years].every(Number.isFinite) || amount <= 0 || years <= 0 || rate < 0) return null;
    try {
      return loanPayment(amount, rate, years, Number(state.frequency));
    } catch {
      return null;
    }
  }, [state]);

  const perYear = Number(state.frequency);
  const yearly = useMemo(() => {
    if (!result) return [];
    const rows: { year: number; interest: number; principal: number; balance: number }[] = [];
    result.schedule.forEach((p) => {
      const year = Math.ceil(p.period / perYear);
      const row = rows[year - 1] ?? (rows[year - 1] = { year, interest: 0, principal: 0, balance: 0 });
      row.interest += p.interest;
      row.principal += p.principal;
      row.balance = p.balance;
    });
    return rows;
  }, [result, perYear]);

  const csv = result ? ["Period,Payment,Principal,Interest,Balance", ...result.schedule.map((p) => [p.period, p.payment.toFixed(2), p.principal.toFixed(2), p.interest.toFixed(2), p.balance.toFixed(2)].join(","))].join("\n") : "";
  const interestShare = result ? (result.totalInterest / result.totalPaid) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Loan amount" suffix="$" value={state.amount} onChange={set("amount")} min={0} />
        <NumberField label="Annual interest rate" suffix="%" value={state.rate} onChange={set("rate")} min={0} />
        <NumberField label="Term" suffix="years" value={state.years} onChange={set("years")} min={0} />
        <Field label="Payments per year">
          {(id) => (
            <Select id={id} value={state.frequency} onChange={(e) => set("frequency")(e.target.value)}>
              <option value="12">Monthly (12)</option>
              <option value="26">Bi-weekly (26)</option>
              <option value="52">Weekly (52)</option>
              <option value="4">Quarterly (4)</option>
              <option value="1">Yearly (1)</option>
            </Select>
          )}
        </Field>
      </div>

      {!result ? <Alert tone="warning">Enter a positive loan amount, interest rate and term.</Alert> : null}

      {result ? (
        <>
          <ResultSlab label="Payment per period" value={formatMoney(result.payment)} valueTestId="payment" />
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <Stat label="Total interest" value={formatMoney(result.totalInterest)} />
            <Stat label="Total paid" value={formatMoney(result.totalPaid)} />
            <Stat label="Number of payments" value={result.schedule.length} />
          </StatGrid>
          <div role="img" aria-label={`Interest is ${interestShare.toFixed(0)} percent of everything you pay`} className="flex h-3 border border-foreground bg-card">
            <span className="bg-primary" style={{ width: `${100 - interestShare}%` }} />
            <span className="bg-foreground" style={{ width: `${interestShare}%` }} />
          </div>
          <p className="-mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-2.5 bg-primary" /> Principal {(100 - interestShare).toFixed(0)}%</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 bg-foreground" /> Interest {interestShare.toFixed(0)}%</span>
          </p>

          <Panel
            title={showAll ? "Full amortization schedule" : "Year by year"}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show yearly summary" : "Show every payment"}
                </Button>
                <DownloadButton data={csv} filename="amortization.csv" mime="text/csv" label="CSV" />
              </>
            }
          >
            <ScrollArea label={showAll ? "Full amortization schedule" : "Yearly summary"} className="max-h-96 rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm tabular-nums">
                <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">{showAll ? "Payment" : "Year"}</th>
                    <th className="px-4 py-2 font-medium">Principal</th>
                    <th className="px-4 py-2 font-medium">Interest</th>
                    <th className="px-4 py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-[13px]">
                  {(showAll ? result.schedule.map((p) => ({ label: p.period, principal: p.principal, interest: p.interest, balance: p.balance })) : yearly.map((y) => ({ label: y.year, principal: y.principal, interest: y.interest, balance: y.balance }))).map((r) => (
                    <tr key={r.label}>
                      <td className="px-4 py-1.5 text-left">{r.label}</td>
                      <td className="px-4 py-1.5">{formatMoney(r.principal)}</td>
                      <td className="px-4 py-1.5">{formatMoney(r.interest)}</td>
                      <td className="px-4 py-1.5">{formatMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
