"use client";

import type { ReactNode } from "react";
import { Card, useShareableState } from "@toolwright/ui";
import { decreaseByPercent, increaseByPercent, percentChange, percentOf, whatPercent } from "@toolwright/core/calc";
import { NumberField, num } from "../../shared/number-field";

const fmt = (n: number) => (Number.isFinite(n) ? String(Number(n.toPrecision(10))) : "—");

function Block({ title, children, result }: { title: string; children: ReactNode; result: string }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
      <p className="border border-l-4 border-border border-l-primary bg-muted px-4 py-3 font-display text-3xl font-bold tabular-nums" aria-live="polite">
        {result}
      </p>
    </Card>
  );
}

export default function Tool() {
  const { state, setState } = useShareableState({ a1: "15", b1: "200", a2: "30", b2: "200", a3: "50", b3: "75", a4: "200", b4: "10", a5: "200", b5: "10" });
  const set = (key: keyof typeof state) => (value: string) => setState((s) => ({ ...s, [key]: value }));

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Block title="What is X% of Y?" result={fmt(percentOf(num(state.a1), num(state.b1)))}>
        <NumberField label="Percent" suffix="%" value={state.a1} onChange={set("a1")} />
        <NumberField label="Of" value={state.b1} onChange={set("b1")} />
      </Block>
      <Block title="X is what percent of Y?" result={Number.isFinite(whatPercent(num(state.a2), num(state.b2))) ? `${fmt(whatPercent(num(state.a2), num(state.b2)))}%` : "—"}>
        <NumberField label="X" value={state.a2} onChange={set("a2")} />
        <NumberField label="Y" value={state.b2} onChange={set("b2")} />
      </Block>
      <Block title="Percentage change from X to Y" result={Number.isFinite(percentChange(num(state.a3), num(state.b3))) ? `${percentChange(num(state.a3), num(state.b3)) > 0 ? "+" : ""}${fmt(percentChange(num(state.a3), num(state.b3)))}%` : "—"}>
        <NumberField label="From" value={state.a3} onChange={set("a3")} />
        <NumberField label="To" value={state.b3} onChange={set("b3")} />
      </Block>
      <Block title="Increase Y by X%" result={fmt(increaseByPercent(num(state.a4), num(state.b4)))}>
        <NumberField label="Value" value={state.a4} onChange={set("a4")} />
        <NumberField label="Increase" suffix="%" value={state.b4} onChange={set("b4")} />
      </Block>
      <Block title="Decrease Y by X% (discount)" result={fmt(decreaseByPercent(num(state.a5), num(state.b5)))}>
        <NumberField label="Value" value={state.a5} onChange={set("a5")} />
        <NumberField label="Decrease" suffix="%" value={state.b5} onChange={set("b5")} />
      </Block>
    </div>
  );
}
