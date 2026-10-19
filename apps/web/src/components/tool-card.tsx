import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge, cn } from "@toolwright/ui";
import { CATEGORY_BY_ID, type ToolMeta } from "@toolwright/tools";
import { FavoriteButton } from "./favorite-button";

/** A tool tile. The whole card is one link (via a stretched pseudo-element); the star sits above it. */
export function ToolCard({ tool, className, showCategory = true }: { tool: ToolMeta; className?: string; showCategory?: boolean }) {
  const Icon = tool.icon;
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-within:border-primary/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon aria-hidden className="size-5" />
        </span>
        <FavoriteButton slug={tool.slug} name={tool.name} className="-mr-1 -mt-1" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold leading-snug">
          <Link href={`/tools/${tool.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {tool.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tool.tagline}</p>
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        {showCategory ? <Badge>{CATEGORY_BY_ID[tool.category].name}</Badge> : <span />}
        <ArrowUpRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
      </div>
    </article>
  );
}

export function ToolGrid({ tools, className, showCategory = true }: { tools: readonly ToolMeta[]; className?: string; showCategory?: boolean }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {tools.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} showCategory={showCategory} />
      ))}
    </div>
  );
}
