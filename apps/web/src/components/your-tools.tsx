"use client";

import Link from "next/link";
import { History, Star } from "lucide-react";
import { getTool, type ToolMeta } from "@toolwright/tools";
import { FAVORITES_KEY, RECENTS_KEY, useLocalList } from "../lib/local-list";
import { ToolCard } from "./tool-card";

function resolve(slugs: readonly string[], limit: number): ToolMeta[] {
  return slugs.map((s) => getTool(s)).filter((t): t is ToolMeta => Boolean(t)).slice(0, limit);
}

/** Favorites and recently used tools. Renders nothing until the visitor has some (they live only in this browser). */
export function YourTools() {
  const favorites = resolve(useLocalList(FAVORITES_KEY), 8);
  const recents = resolve(useLocalList(RECENTS_KEY), 4).filter((t) => !favorites.includes(t));
  if (favorites.length === 0 && recents.length === 0) return null;

  return (
    <section aria-labelledby="your-tools" className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
      <h2 id="your-tools" className="sr-only">
        Your tools
      </h2>
      {favorites.length > 0 ? (
        <div>
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Star aria-hidden className="size-4 fill-warning text-warning" /> Favorites
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {favorites.map((t) => (
              <ToolCard key={t.slug} tool={t} showCategory={false} />
            ))}
          </div>
        </div>
      ) : null}
      {recents.length > 0 ? (
        <div className={favorites.length ? "mt-10" : undefined}>
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <History aria-hidden className="size-4" /> Recently used
          </p>
          <ul className="flex flex-wrap gap-2">
            {recents.map((t) => (
              <li key={t.slug}>
                <Link href={`/tools/${t.slug}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/5">
                  <t.icon aria-hidden className="size-4 text-primary" /> {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
