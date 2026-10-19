"use client";

import { Star } from "lucide-react";
import { cn } from "@toolwright/ui";
import { FAVORITES_KEY, toggleFavorite, useLocalList } from "../lib/local-list";

export function FavoriteButton({ slug, name, className, withLabel = false }: { slug: string; name: string; className?: string; withLabel?: boolean }) {
  const favorites = useLocalList(FAVORITES_KEY);
  const active = favorites.includes(slug);
  return (
    <button
      type="button"
      aria-pressed={active}
      // With a visible "Favorite" label the label itself is the name; icon-only buttons need a descriptive one.
      aria-label={withLabel ? undefined : active ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      title={active ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(slug);
      }}
      className={cn(
        "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        withLabel ? "h-9 border border-border bg-card px-3 text-sm font-medium hover:bg-muted" : "size-8",
        className,
      )}
    >
      <Star aria-hidden className={cn("size-4", active && "fill-warning text-warning")} />
      {withLabel ? "Favorite" : null}
    </button>
  );
}
