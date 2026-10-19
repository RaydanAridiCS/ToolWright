import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The headline result of a calculator or converter: a raised slip with the answer in large display numerals.
 * Replaces the old tinted result box. Pass `valueTestId` for e2e tests.
 */
export function ResultSlab({
  label,
  value,
  note,
  valueTestId,
  className,
  size = "lg",
  "aria-live": ariaLive = "polite",
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  valueTestId?: string;
  className?: string;
  /** `lg` for numbers, `md` for sentences. */
  size?: "lg" | "md";
  "aria-live"?: "off" | "polite" | "assertive";
}) {
  return (
    <div className={cn("border border-foreground bg-card px-5 py-4 shadow-md", className)} aria-live={ariaLive}>
      <p className="label-plate">{label}</p>
      <p className={cn("mt-1 font-display font-bold tabular-nums text-foreground", size === "lg" ? "break-all text-4xl leading-none sm:text-5xl" : "break-words text-2xl leading-tight sm:text-3xl")} data-testid={valueTestId}>
        {value}
      </p>
      {note ? <p className="mt-2 text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}
