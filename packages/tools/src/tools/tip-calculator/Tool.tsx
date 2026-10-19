"use client";

import { useMemo } from "react";
import { Alert, Button, Stat, StatGrid, Toggle, useShareableState } from "@toolwright/ui";
import { splitBill } from "@toolwright/core/calc";
import { NumberField, num } from "../../shared/number-field";
import { formatMoney } from "../../shared/format";

const PRESETS = [10, 15, 18, 20, 25];

export default function Tool() {
  const { state, setState } = useShareableState({ bill: "86.40", tip: "18", people: "3", roundUp: false });
  const set = (key: "bill" | "tip" | "people") => (value: string) => setState((s) => ({ ...s, [key]: value }));

  const result = useMemo(() => {
    const bill = num(state.bill);
    const tip = num(state.tip);
    const people = Math.floor(num(state.people));
    if (![bill, tip].every(Number.isFinite) || !(people >= 1) || bill < 0 || tip < 0) return null;
    const r = splitBill(bill, tip, people);
    return state.roundUp ? { ...r, perPerson: Math.ceil(r.perPerson), total: Math.ceil(r.perPerson) * people, tip: Math.ceil(r.perPerson) * people - bill } : r;
  }, [state]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <NumberField label="Bill" suffix="$" value={state.bill} onChange={set("bill")} min={0} />
        <NumberField label="Tip" suffix="%" value={state.tip} onChange={set("tip")} min={0} />
        <NumberField label="People" value={state.people} onChange={set("people")} min={1} step={1} />
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          {PRESETS.map((p) => (
            <Button key={p} size="sm" variant={Number(state.tip) === p ? "primary" : "outline"} onClick={() => set("tip")(String(p))}>
              {p}%
            </Button>
          ))}
        </div>
        <Toggle label="Round each person's share up to the next whole dollar" checked={state.roundUp} onCheckedChange={(roundUp) => setState((s) => ({ ...s, roundUp }))} className="sm:col-span-3" />
      </div>
      {!result ? <Alert tone="warning">Enter a bill, a tip and at least one person.</Alert> : null}
      {result ? (
        <>
          <div className="rounded-xl border border-primary/30 bg-primary/8 p-5">
            <p className="text-sm text-muted-foreground">Each person pays</p>
            <p className="font-mono text-4xl font-semibold" data-testid="per-person">
              {formatMoney(result.perPerson)}
            </p>
          </div>
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <Stat label="Tip total" value={formatMoney(result.tip)} />
            <Stat label="Grand total" value={formatMoney(result.total)} />
            <Stat label="Tip per person" value={formatMoney(result.tip / Math.floor(num(state.people)))} />
          </StatGrid>
        </>
      ) : null}
    </div>
  );
}
