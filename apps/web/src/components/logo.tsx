import { cn } from "@toolwright/ui";

/**
 * The Toolwright mark: the head of an open-end spanner with its bolt hole, underlined by a highlighter stroke.
 * Flat, no gradient. It takes its colors from the theme, so it reads on paper and on ink.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={cn("size-8", className)}>
      <rect x="2" y="2" width="28" height="25" fill="var(--foreground)" />
      <rect x="11" y="2" width="10" height="11" fill="var(--background)" />
      <circle cx="16" cy="20" r="3.2" fill="var(--background)" />
      <rect x="2" y="28.5" width="28" height="3" fill="var(--marker)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[22px] font-extrabold leading-none tracking-tight">Toolwright</span>
    </span>
  );
}
