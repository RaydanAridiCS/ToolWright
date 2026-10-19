"use client";

import type { ReactNode } from "react";
import { Field, Input } from "@toolwright/ui";

/**
 * A labelled numeric input that keeps its value as a string, so users can clear it,
 * type "1." or "-" and so on without the field fighting them.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix,
  min,
  max,
  step,
  placeholder,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <div className="relative">
          <Input id={id} type="number" inputMode="decimal" mono value={value} min={min} max={max} step={step ?? "any"} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={suffix ? "pr-12" : undefined} />
          {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span> : null}
        </div>
      )}
    </Field>
  );
}

/** Parse a numeric field value, returning NaN for blank or invalid input. */
export function num(value: string): number {
  return value.trim() === "" ? NaN : Number(value);
}
