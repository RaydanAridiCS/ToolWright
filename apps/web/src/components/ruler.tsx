import { cn } from "@toolwright/ui";

/**
 * A measuring ruler used as a section divider. It is not decoration for its own sake: it marks the scale
 * of the catalogue ("71 tools") the way a ruler marks length. Pure SVG ticks, drawn in the current text color.
 */
export function Ruler({ label, className }: { label?: string; className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-8 w-full select-none overflow-hidden text-foreground", className)}>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="tw-ruler-minor" width="10" height="32" patternUnits="userSpaceOnUse">
            <path d="M0.5 0V8" stroke="currentColor" strokeWidth="1" fill="none" />
          </pattern>
          <pattern id="tw-ruler-major" width="50" height="32" patternUnits="userSpaceOnUse">
            <path d="M0.5 0V16" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="32" fill="url(#tw-ruler-minor)" />
        <rect width="100%" height="32" fill="url(#tw-ruler-major)" />
        <path d="M0 0.5H10000" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {label ? <span className="label-plate absolute bottom-0 right-0 bg-background px-2 text-foreground">{label}</span> : null}
    </div>
  );
}
