import type { ReactNode } from "react";
import { cn } from "@toolwright/ui";
import type { ToolMeta } from "@toolwright/tools";

/*
 * Specimen glyphs: small drawings for the tools people use most, all on one 32px grid with the same
 * 1.75px square-capped stroke so they read as a set. Every other tool falls back to its lucide icon in the same frame.
 */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "square", strokeLinejoin: "miter" } as const;

const SPECIMENS: Record<string, ReactNode> = {
  // two sheets feeding one
  "merge-pdf": (
    <g {...S}>
      <path d="M5 4h9v10H5zM18 4h9v10h-9z" />
      <path d="M16 16v4M12 20h8M9 20v3h14v-3" />
      <path d="M10 26h12" />
    </g>
  ),
  // picture frame with a press
  "image-compressor": (
    <g {...S}>
      <path d="M4 6h24v20H4z" />
      <path d="m4 22 7-7 5 5 4-4 8 8" />
      <circle cx="21" cy="12" r="2" />
    </g>
  ),
  "json-formatter": (
    <g {...S}>
      <path d="M11 5H8v7l-3 4 3 4v7h3M21 5h3v7l3 4-3 4v7h-3" />
      <path d="M14 13h4M14 19h4" />
    </g>
  ),
  // finder squares + data dots
  "qr-code-generator": (
    <g {...S}>
      <path d="M4 4h9v9H4zM19 4h9v9h-9zM4 19h9v9H4z" />
      <path d="M7 7h3v3H7zM22 7h3v3h-3zM7 22h3v3H7z" fill="currentColor" />
      <path d="M19 19h3M25 19h3M19 25h3v3M25 22v6" />
    </g>
  ),
  // key
  "password-generator": (
    <g {...S}>
      <circle cx="10" cy="16" r="5" />
      <path d="M15 16h14M25 16v5M21 16v4" />
    </g>
  ),
  // two columns, one changed line
  "text-diff": (
    <g {...S}>
      <path d="M4 5h10v22H4zM18 5h10v22H18z" />
      <path d="M7 10h4M7 15h4M7 20h4" />
      <path d="M21 10h4M21 15h4M21 20h4M23 13v4" />
    </g>
  ),
  // ruler
  "unit-converter": (
    <g {...S}>
      <path d="M3 11h26v10H3z" />
      <path d="M8 11v4M13 11v6M18 11v4M23 11v6" />
    </g>
  ),
  // token cut in three
  "jwt-decoder": (
    <g {...S}>
      <path d="M4 8h24v16H4z" />
      <path d="M12 8v16M20 8v16" />
      <path d="M7 14h2M15 14h2M23 14h2M7 18h2M15 18h2" />
    </g>
  ),
  // frame and swap
  "image-converter": (
    <g {...S}>
      <path d="M3 5h12v9H3zM17 18h12v9H17z" />
      <path d="M17 9h8l-3-3M15 23H7l3 3" />
    </g>
  ),
  "word-counter": (
    <g {...S}>
      <path d="M4 7h24M4 13h24M4 19h16" />
      <path d="M22 22h6M25 19v6" />
    </g>
  ),
  // hash mark
  "hash-generator": (
    <g {...S}>
      <path d="M12 4 10 28M22 4l-2 24M5 12h22M4 20h22" />
    </g>
  ),
  // clock
  "timestamp-converter": (
    <g {...S}>
      <circle cx="16" cy="16" r="12" />
      <path d="M16 8v8l6 3" />
      <path d="M16 4v2M16 26v2M4 16h2M26 16h2" />
    </g>
  ),
};

export function hasSpecimen(slug: string): boolean {
  return slug in SPECIMENS;
}

/** The tool's drawing in a ruled frame. */
export function ToolGlyph({ tool, size = 48, className }: { tool: Pick<ToolMeta, "slug" | "icon">; size?: number; className?: string }) {
  const Icon = tool.icon;
  const specimen = SPECIMENS[tool.slug];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center border border-current/40 bg-card text-foreground", className)}
      style={{ width: size, height: size }}
    >
      {specimen ? (
        <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62}>
          {specimen}
        </svg>
      ) : (
        <Icon strokeWidth={1.75} strokeLinecap="square" strokeLinejoin="miter" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </span>
  );
}
