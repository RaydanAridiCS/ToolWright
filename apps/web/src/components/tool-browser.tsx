"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button, cn } from "@toolwright/ui";
import { CATEGORIES, CATEGORY_BY_ID, isCategoryId, searchTools, tools, type CategoryId, type ToolMeta } from "@toolwright/tools";
import { FAVORITES_KEY, useLocalList } from "../lib/local-list";
import { Ledger } from "./ledger";

/** Searchable, filterable catalogue. State lives in the URL (?q=…&category=…) so views are linkable. */
export function ToolBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const favorites = useLocalList(FAVORITES_KEY);

  const q = params.get("q") ?? "";
  const rawCategory = params.get("category") ?? "";
  const category: CategoryId | "" = isCategoryId(rawCategory) ? rawCategory : "";
  const onlyFavorites = params.get("favorites") === "1";

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const searching = q.trim().length > 0;
  const hits = useMemo(() => (searching ? searchTools(q, 200).map((h) => h.tool) : null), [q, searching]);

  const visible = useMemo(() => {
    const base = hits ?? [...tools].sort((a, b) => a.name.localeCompare(b.name));
    return base.filter((t) => (!category || t.category === category) && (!onlyFavorites || favorites.includes(t.slug)));
  }, [hits, category, onlyFavorites, favorites]);

  const counts = useMemo(() => {
    const matching = hits ? new Set(hits.map((t) => t.slug)) : null;
    return Object.fromEntries(CATEGORIES.map((c) => [c.id, tools.filter((t) => t.category === c.id && (!matching || matching.has(t.slug))).length])) as Record<CategoryId, number>;
  }, [hits]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Without a search, group by drawer; with one, keep relevance order in a single list.
  const groups = useMemo(() => {
    if (searching) return [{ id: null as CategoryId | null, tools: visible }];
    return CATEGORIES.map((c) => ({ id: c.id as CategoryId | null, tools: visible.filter((t) => t.category === c.id) })).filter((g) => g.tools.length > 0);
  }, [visible, searching]);

  return (
    <div>
      <div className="relative border-b-2 border-foreground">
        <Search aria-hidden className="pointer-events-none absolute left-0 top-1/2 size-6 -translate-y-1/2" />
        <input
          type="search"
          aria-label="Search tools"
          placeholder={`Search ${tools.length} tools: pdf, json, password…`}
          value={q}
          onChange={(e) => update({ q: e.target.value || null })}
          className="h-16 w-full bg-transparent pl-10 pr-12 font-display text-2xl font-bold tracking-tight placeholder:font-semibold placeholder:text-muted-foreground focus-visible:outline-offset-8 sm:text-3xl [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <Button variant="ghost" size="icon" aria-label="Clear search" className="absolute right-0 top-1/2 -translate-y-1/2" onClick={() => update({ q: null })}>
            <X />
          </Button>
        ) : null}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-14">
        <div role="group" aria-label="Filter by category" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:gap-0 lg:self-start lg:overflow-visible lg:border-t lg:border-foreground lg:px-0 lg:pb-0">
          <RailItem active={!category && !onlyFavorites} onClick={() => update({ category: null, favorites: null })} count={total}>
            All tools
          </RailItem>
          {CATEGORIES.map((c) => (
            <RailItem key={c.id} active={category === c.id} disabled={counts[c.id] === 0} count={counts[c.id]} onClick={() => update({ category: category === c.id ? null : c.id, favorites: null })}>
              {c.name}
            </RailItem>
          ))}
          <RailItem active={onlyFavorites} count={favorites.length} onClick={() => update({ favorites: onlyFavorites ? null : "1", category: null })}>
            Saved
          </RailItem>
        </div>

        <div className="min-w-0">
          <p className="label-plate mb-4" aria-live="polite" role="status">
            {visible.length} tool{visible.length === 1 ? "" : "s"}
            {searching ? ` matching “${q}”` : ""}
            {category ? ` in ${CATEGORY_BY_ID[category].name}` : ""}
          </p>

          {visible.length > 0 ? (
            groups.map((g) => (
              <section key={g.id ?? "results"} aria-label={g.id ? CATEGORY_BY_ID[g.id].name : "Results"} className="mb-12 last:mb-0">
                {g.id ? (
                  <h2 className="mb-3 flex items-baseline justify-between font-display text-3xl font-extrabold tracking-tight">
                    {CATEGORY_BY_ID[g.id].name}
                    <span className="font-mono text-sm font-medium text-muted-foreground">{String(g.tools.length).padStart(2, "0")}</span>
                  </h2>
                ) : null}
                <Ledger tools={g.tools as ToolMeta[]} compact sequential={false} showCategory={searching} />
              </section>
            ))
          ) : (
            <div className="border border-dashed border-foreground/60 p-10 text-center">
              <p className="font-display text-2xl font-bold">{onlyFavorites ? "Nothing saved yet." : "No tools match your search."}</p>
              <p className="mt-1 text-sm text-muted-foreground">{onlyFavorites ? "Tap the star on any tool to keep it here." : "Try another word, or ask for the tool you need."}</p>
              {!onlyFavorites ? (
                <Button className="mt-5" variant="primary" onClick={() => router.push("/requests")}>
                  Request a tool
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RailItem({ active, children, onClick, disabled, count }: { active: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-baseline justify-between gap-6 border-b border-border px-3 py-2.5 text-left text-[15px] font-semibold transition-colors disabled:opacity-40 lg:w-full lg:px-2",
        active ? "bg-marker text-marker-foreground" : "hover:bg-muted",
      )}
    >
      <span>{children}</span>
      <span className={cn("font-mono text-xs tabular-nums", active ? "text-marker-foreground" : "text-muted-foreground")}>{String(count).padStart(2, "0")}</span>
    </button>
  );
}
