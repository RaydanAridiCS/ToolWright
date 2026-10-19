import type { ReactNode } from "react";
import { cn } from "./cn";

/** Printer's crop marks: four small corner ticks just outside the plate. Decorative, hidden from assistive tech. */
function CropMarks() {
  const base = "pointer-events-none absolute size-2.5 border-foreground";
  return (
    <>
      <i aria-hidden className={cn(base, "-left-2 -top-2 border-b border-r")} />
      <i aria-hidden className={cn(base, "-right-2 -top-2 border-b border-l")} />
      <i aria-hidden className={cn(base, "-bottom-2 -left-2 border-r border-t")} />
      <i aria-hidden className={cn(base, "-bottom-2 -right-2 border-l border-t")} />
    </>
  );
}

export interface PlateProps {
  /** Mono caption on the left of the top strip, e.g. "TOOL 014 · DEVELOPER". */
  label?: ReactNode;
  /** Controls on the right of the top strip. */
  actions?: ReactNode;
  /** Rendered under the content, usually a `StatusLine`. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding of the content area. */
  padded?: boolean;
  "aria-label"?: string;
}

/**
 * The Plate: a sheet of paper with a ruled caption strip and crop marks. Every tool sits on one,
 * so the interface always looks like a part with a label, not a floating widget.
 */
export function Plate({ label, actions, footer, children, className, padded = true, "aria-label": ariaLabel }: PlateProps) {
  return (
    <section aria-label={ariaLabel} className={cn("relative border border-foreground bg-card", className)}>
      <CropMarks />
      {label || actions ? (
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-foreground px-4 py-1.5">
          <span className="label-plate text-foreground">{label}</span>
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(padded && "p-4 sm:p-6")}>{children}</div>
      {footer}
    </section>
  );
}

/** The ruled strip at the bottom of a plate: small mono facts separated by space. */
export function StatusLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-plate flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-foreground bg-muted px-4 py-2", className)}>{children}</div>;
}
