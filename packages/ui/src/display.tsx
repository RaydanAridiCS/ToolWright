import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground", className)} {...props} />;
}

export type BadgeTone = "neutral" | "primary" | "accent" | "success" | "danger";

// Badges are status stamps, not decoration: square, mono, outlined, never filled with a tint.
const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-border text-muted-foreground",
  primary: "border-primary text-primary",
  accent: "border-primary text-primary",
  success: "border-success text-success",
  danger: "border-danger text-danger",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.08em]", badgeTones[tone], className)}
      {...props}
    />
  );
}

export type AlertTone = "info" | "success" | "warning" | "error";

// Alerts are a ruled note with a coloured left bar, like an annotation in a margin.
const alertStyles: Record<AlertTone, { bar: string; icon: typeof Info; iconColor: string }> = {
  info: { bar: "border-l-primary", icon: Info, iconColor: "text-primary" },
  success: { bar: "border-l-success", icon: CheckCircle2, iconColor: "text-success" },
  warning: { bar: "border-l-warning", icon: AlertTriangle, iconColor: "text-warning" },
  error: { bar: "border-l-danger", icon: AlertTriangle, iconColor: "text-danger" },
};

export function Alert({ tone = "info", title, children, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { bar, icon: Icon, iconColor } = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 border border-l-4 border-border bg-card px-4 py-3 text-sm text-foreground", bar, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconColor)} />
      <div className="min-w-0 break-words">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5 text-muted-foreground")}>{children}</div> : null}
      </div>
    </div>
  );
}

/** A labelled value, used for results such as "Characters 1,234". Cells share borders inside a StatGrid. */
export function Stat({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("border-b border-r border-border bg-card px-4 py-3", className)}>
      <dt className="label-plate">{label}</dt>
      <dd className="mt-1 break-words font-display text-2xl font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 lg:grid-cols-4", className)}>{children}</dl>;
}

/** Section container used inside tools. */
export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      {title || actions ? (
        <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {title ? <h3 className="font-display text-[17px] font-bold leading-tight text-foreground">{title}</h3> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A scrollable box that keyboard users can focus and scroll (WCAG 2.1.1). Always give it a label.
 * `role="region"` makes screen readers announce what the scrollable content is.
 */
export function ScrollArea({ label, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn("overflow-auto focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring", className)} {...props}>
      {children}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded-sm border border-foreground/50 bg-card px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-[1px_1px_0_0_var(--shadow-ink)]", className)}>{children}</kbd>
  );
}
