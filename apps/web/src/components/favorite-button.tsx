"use client";

import { Star } from "lucide-react";
import { cn } from "@toolwright/ui";
import { FAVORITES_KEY, toggleFavorite, useLocalList } from "../lib/local-list";

/** A star. Saved tools get a highlighter-filled star outlined in ink. */
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
        "relative z-10 inline-flex items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground",
        withLabel ? "h-10 border border-foreground/60 bg-card px-4 text-sm font-semibold text-foreground hover:bg-marker hover:text-marker-foreground" : "size-8",
        className,
      )}
    >
      <Star aria-hidden className={cn("size-4", active && "fill-marker text-foreground")} strokeWidth={active ? 2 : 1.75} />
      {withLabel ? "Favorite" : null}
    </button>
  );
}
