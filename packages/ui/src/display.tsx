import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}

export type BadgeTone = "neutral" | "primary" | "accent" | "success" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/12 text-accent",
  success: "bg-success/12 text-success",
  danger: "bg-danger/12 text-danger",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)} {...props} />;
}

export type AlertTone = "info" | "success" | "warning" | "error";

const alertStyles: Record<AlertTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-primary/30 bg-primary/8 text-foreground", icon: Info },
  success: { box: "border-success/30 bg-success/10 text-foreground", icon: CheckCircle2 },
  warning: { box: "border-warning/40 bg-warning/12 text-foreground", icon: AlertTriangle },
  error: { box: "border-danger/40 bg-danger/10 text-foreground", icon: AlertTriangle },
};

export function Alert({ tone = "info", title, children, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { box, icon: Icon } = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-sm", box, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-primary")} />
      <div className="min-w-0 break-words">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5 text-muted-foreground")}>{children}</div> : null}
      </div>
    </div>
  );
}

/** A labelled value, used for results such as "Characters 1,234". */
export function Stat({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3.5 py-3", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-mono text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>{children}</dl>;
}

/** Section container used inside tools. */
export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      {title || actions ? (
        <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : <span />}
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
    <div role="region" aria-label={label} tabIndex={0} className={cn("overflow-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)} {...props}>
      {children}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground", className)}>{children}</kbd>;
}
