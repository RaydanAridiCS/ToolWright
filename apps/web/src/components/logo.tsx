import { cn } from "@toolwright/ui";

/** The Toolwright mark: a rounded tile with a "T" whose crossbar ends in a teal wrench-jaw notch. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={cn("size-8", className)}>
      <defs>
        <linearGradient id="tw-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#tw-logo-gradient)" />
      <path d="M8 9.5h16v4h-5.5V24h-5V13.5H8z" fill="#fff" />
      <circle cx="24.5" cy="23.5" r="2.5" fill="#2dd4bf" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[17px]">Toolwright</span>
    </span>
  );
}
