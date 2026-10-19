"use client";

import Link from "next/link";
import { getTool, type ToolMeta } from "@toolwright/tools";
import { FAVORITES_KEY, RECENTS_KEY, useLocalList } from "../lib/local-list";
import { Ledger } from "./ledger";

function resolve(slugs: readonly string[], limit: number): ToolMeta[] {
  return slugs.map((s) => getTool(s)).filter((t): t is ToolMeta => Boolean(t)).slice(0, limit);
}

/** Favorites and recently used tools, kept in this browser only. Renders nothing until there is something to show. */
export function YourTools() {
  const favorites = resolve(useLocalList(FAVORITES_KEY), 6);
  const recents = resolve(useLocalList(RECENTS_KEY), 5).filter((t) => !favorites.includes(t));
  if (favorites.length === 0 && recents.length === 0) return null;

  return (
    <section aria-labelledby="your-tools" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
      <h2 id="your-tools" className="font-display text-3xl font-extrabold tracking-tight">
        Your bench
      </h2>
      <p className="label-plate mt-1">Saved in this browser only</p>
      {favorites.length > 0 ? <Ledger tools={favorites} compact showCategory={false} className="mt-5" /> : null}
      {recents.length > 0 ? (
        <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="label-plate">Recently used</span>
          {recents.map((t, i) => (
            <span key={t.slug}>
              <Link href={`/tools/${t.slug}`} className="font-semibold underline decoration-2 underline-offset-4 hover:bg-marker hover:text-marker-foreground">
                {t.name}
              </Link>
              {i < recents.length - 1 ? <span aria-hidden className="ml-3 text-muted-foreground">/</span> : null}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
