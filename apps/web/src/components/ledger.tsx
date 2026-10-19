import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@toolwright/ui";
import { CATEGORY_BY_ID, tools as allTools, type ToolMeta } from "@toolwright/tools";
import { FavoriteButton } from "./favorite-button";
import { ToolGlyph } from "./tool-glyph";

/** A tool's catalogue number: its 1-based position in the full list, zero-padded ("014"). */
export function catalogueNumber(slug: string): string {
  return String(allTools.findIndex((t) => t.slug === slug) + 1).padStart(3, "0");
}

export interface LedgerProps {
  tools: readonly ToolMeta[];
  /** Number rows 01, 02… (true) or use each tool's catalogue number (false). */
  sequential?: boolean;
  /** Show the drawn glyph beside each row. */
  glyphs?: boolean;
  /** Show the category on the right. */
  showCategory?: boolean;
  /** Tighter rows for long lists. */
  compact?: boolean;
  className?: string;
}

/**
 * The ledger: tools as numbered rows with hairline rules. Hovering a row sweeps the highlighter across it.
 * Each row is one link (stretched over the row); the favorite star sits above it.
 */
export function Ledger({ tools, sequential = true, glyphs = false, showCategory = true, compact = false, className }: LedgerProps) {
  return (
    <ol className={cn("border-t border-foreground", className)}>
      {tools.map((tool, i) => (
        <li key={tool.slug} className="ledger-row border-b border-border">
          <div className={cn("relative flex items-center gap-3 px-2 sm:gap-5", compact ? "py-3" : "py-4 sm:py-5")}>
            <span className="label-plate ledger-muted w-8 shrink-0 tabular-nums">{sequential ? String(i + 1).padStart(2, "0") : catalogueNumber(tool.slug)}</span>
            {glyphs ? <ToolGlyph tool={tool} size={compact ? 40 : 52} className="hidden sm:inline-flex" /> : null}
            <div className="ledger-shift min-w-0 flex-1">
              <h3 className={cn("font-display font-bold leading-tight tracking-tight", compact ? "text-xl" : "text-2xl sm:text-[28px]")}>
                <Link href={`/tools/${tool.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                  {tool.name}
                </Link>
              </h3>
              <p className="ledger-muted mt-0.5 line-clamp-1 hidden text-sm text-muted-foreground sm:block">{tool.tagline}</p>
            </div>
            {showCategory ? <span className="label-plate ledger-muted hidden w-32 shrink-0 text-right md:block">{CATEGORY_BY_ID[tool.category].name}</span> : null}
            <FavoriteButton slug={tool.slug} name={tool.name} className="ledger-muted shrink-0" />
            <ArrowUpRight aria-hidden className="size-5 shrink-0" />
          </div>
        </li>
      ))}
    </ol>
  );
}
