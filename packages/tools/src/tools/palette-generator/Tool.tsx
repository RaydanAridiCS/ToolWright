"use client";

import { useMemo } from "react";
import { Alert, CopyButton, Field, Input, Panel, SegmentedControl, Select, Textarea, useShareableState } from "@toolwright/ui";
import { colorHarmony, generateScale, parseColor, readableTextColor, rgbToHex, type Harmony } from "@toolwright/core/color";

const HARMONIES: { value: Harmony; label: string }[] = [
  { value: "complementary", label: "Complementary" },
  { value: "analogous", label: "Analogous" },
  { value: "triadic", label: "Triadic" },
  { value: "tetradic", label: "Tetradic" },
  { value: "split-complementary", label: "Split complementary" },
  { value: "monochromatic", label: "Monochromatic" },
];

function Swatch({ hex, label }: { hex: string; label?: string }) {
  const parsed = parseColor(hex);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(hex)}
      title={`Copy ${hex}`}
      className="flex min-h-20 flex-1 flex-col justify-end rounded-lg p-2 text-left font-mono text-[11px] transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{ background: hex, color: parsed ? readableTextColor(parsed) : undefined }}
    >
      {label ? <span className="font-semibold">{label}</span> : null}
      <span>{hex}</span>
    </button>
  );
}

export default function Tool() {
  const { state, setState } = useShareableState({ base: "#0b6b55", harmony: "analogous" as Harmony, name: "brand", format: "css" as "css" | "tailwind" });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const base = useMemo(() => parseColor(state.base), [state.base]);
  const scale = useMemo(() => (base ? generateScale(base) : []), [base]);
  const harmony = useMemo(() => (base ? colorHarmony(base, state.harmony) : []), [base, state.harmony]);
  const name = state.name.trim().replace(/[^a-z0-9-]/gi, "-") || "brand";

  const exported =
    state.format === "css"
      ? `:root {\n${scale.map((s) => `  --${name}-${s.step}: ${s.hex};`).join("\n")}\n}`
      : `colors: {\n  ${name}: {\n${scale.map((s) => `    ${s.step}: "${s.hex}",`).join("\n")}\n  },\n},`;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[auto_1fr_12rem]">
        <Field label="Base color">
          {(id) => (
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Base color picker"
                className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"
                value={base ? rgbToHex({ ...base, a: 1 }) : "#000000"}
                onChange={(e) => set({ base: e.target.value })}
              />
              <Input id={id} mono value={state.base} onChange={(e) => set({ base: e.target.value })} className="w-36" />
            </div>
          )}
        </Field>
        <span />
        <Field label="Palette name">{(id) => <Input id={id} value={state.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
      </div>

      {!base ? <Alert tone="error">Enter a valid color to generate a palette.</Alert> : null}

      {base ? (
        <>
          <Panel title="Scale (click a swatch to copy)">
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {scale.map((s) => (
                <Swatch key={s.step} hex={s.hex} label={String(s.step)} />
              ))}
            </div>
          </Panel>

          <Panel
            title="Harmony"
            actions={
              <Select aria-label="Harmony type" value={state.harmony} onChange={(e) => set({ harmony: e.target.value as Harmony })} className="h-8 w-48 text-[13px]">
                {HARMONIES.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </Select>
            }
          >
            <div className="flex gap-2">
              {harmony.map((hex, i) => (
                <Swatch key={`${hex}-${i}`} hex={hex} />
              ))}
            </div>
          </Panel>

          <Panel
            title="Export"
            actions={
              <>
                <SegmentedControl
                  label="Export format"
                  value={state.format}
                  onValueChange={(format) => set({ format })}
                  options={[
                    { value: "css", label: "CSS variables" },
                    { value: "tailwind", label: "Tailwind" },
                  ]}
                />
                <CopyButton text={exported} />
              </>
            }
          >
            <Textarea aria-label="Exported palette" readOnly rows={12} value={exported} className="bg-muted/40" />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
