"use client";

import type { ReactNode } from "react";
import { CopyButton } from "@toolwright/ui";

/** A label, a value, and a copy button. Used for conversion results. */
export function ResultRow({ label, value, hint, mono = true }: { label: ReactNode; value: string; hint?: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 border border-border bg-card px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="label-plate">{label}</p>
        <p className={`break-all text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <CopyButton text={value} label="Copy" size="sm" variant="ghost" />
    </div>
  );
}
