"use client";

import { useMemo } from "react";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { Alert, Badge, Button, Field, Input, cn, useShareableState } from "@toolwright/ui";
import { parseColor, rgbToHex, wcagContrast } from "@toolwright/core/color";

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const parsed = parseColor(value);
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <input
            type="color"
            aria-label={`${label} picker`}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
            value={parsed ? rgbToHex({ ...parsed, a: 1 }) : "#000000"}
            onChange={(e) => onChange(e.target.value)}
          />
          <Input id={id} mono value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!parsed} />
        </div>
      )}
    </Field>
  );
}

function Check_({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 border border-l-4 border-border bg-card px-3.5 py-2.5 text-sm", pass ? "border-l-success" : "border-l-danger")}>
      <span>{label}</span>
      <Badge tone={pass ? "success" : "danger"}>
        {pass ? <Check className="size-3" /> : <X className="size-3" />}
        {pass ? "Pass" : "Fail"}
      </Badge>
    </div>
  );
}

export default function Tool() {
  const { state, setState } = useShareableState({ fg: "#1b1a15", bg: "#ffffff" });
  const fg = useMemo(() => parseColor(state.fg), [state.fg]);
  const bg = useMemo(() => parseColor(state.bg), [state.bg]);
  const result = fg && bg ? wcagContrast(fg, bg) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <ColorField label="Text color" value={state.fg} onChange={(fgValue) => setState((s) => ({ ...s, fg: fgValue }))} />
        <Button variant="outline" size="icon" aria-label="Swap colors" onClick={() => setState((s) => ({ fg: s.bg, bg: s.fg }))} className="mb-0.5 justify-self-center">
          <ArrowLeftRight />
        </Button>
        <ColorField label="Background color" value={state.bg} onChange={(bgValue) => setState((s) => ({ ...s, bg: bgValue }))} />
      </div>

      {!fg || !bg ? <Alert tone="error">Enter valid colors (HEX, rgb(), hsl() or a color name).</Alert> : null}

      {result && fg && bg ? (
        <>
          <div className="rounded-xl border border-border p-6" style={{ background: rgbToHex({ ...bg, a: 1 }), color: rgbToHex({ ...fg, a: 1 }) }} aria-label="Preview">
            <p className="text-3xl font-bold">Large text sample</p>
            <p className="mt-2 text-base">Normal text sample: The quick brown fox jumps over the lazy dog.</p>
            <p className="mt-1 text-xs">Small text sample for checking legibility.</p>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="font-mono text-5xl font-bold tabular-nums" aria-label={`Contrast ratio ${result.ratio.toFixed(2)} to 1`}>
              {result.ratio.toFixed(2)}
            </p>
            <span className="text-lg text-muted-foreground">: 1</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Check_ pass={result.aaNormal} label="AA · normal text (4.5:1)" />
            <Check_ pass={result.aaLarge} label="AA · large text (3:1)" />
            <Check_ pass={result.aaaNormal} label="AAA · normal text (7:1)" />
            <Check_ pass={result.aaaLarge} label="AAA · large text (4.5:1)" />
          </div>
          {(fg.a < 1 || bg.a < 1) && <Alert tone="info">Transparency is ignored. The ratio is calculated for fully opaque colors.</Alert>}
        </>
      ) : null}
    </div>
  );
}
