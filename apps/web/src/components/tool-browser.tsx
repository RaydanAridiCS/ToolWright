"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Star, X } from "lucide-react";
import { Button, Input, cn } from "@toolwright/ui";
import { CATEGORIES, searchTools, tools, isCategoryId, type CategoryId } from "@toolwright/tools";
import { FAVORITES_KEY, useLocalList } from "../lib/local-list";
import { ToolGrid } from "./tool-card";

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

  const visible = useMemo(() => {
    const base = q.trim() ? searchTools(q, 200).map((h) => h.tool) : [...tools].sort((a, b) => a.name.localeCompare(b.name));
    return base.filter((t) => (!category || t.category === category) && (!onlyFavorites || favorites.includes(t.slug)));
  }, [q, category, onlyFavorites, favorites]);

  const counts = useMemo(() => {
    const matching = q.trim() ? new Set(searchTools(q, 200).map((h) => h.tool.slug)) : null;
    return Object.fromEntries(CATEGORIES.map((c) => [c.id, tools.filter((t) => t.category === c.id && (!matching || matching.has(t.slug))).length]));
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search tools"
          placeholder={`Search ${tools.length} tools: try "pdf", "json" or "password"`}
          value={q}
          onChange={(e) => update({ q: e.target.value || null })}
          className="h-14 rounded-xl pl-12 pr-12 text-base"
          autoFocus={false}
        />
        {q ? (
          <Button variant="ghost" size="icon" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => update({ q: null })}>
            <X />
          </Button>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <Chip active={!category && !onlyFavorites} onClick={() => update({ category: null, favorites: null })}>
          All <Count n={Object.values(counts).reduce((a, b) => a + b, 0)} />
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.id} active={category === c.id} disabled={counts[c.id] === 0} onClick={() => update({ category: category === c.id ? null : c.id, favorites: null })}>
            <c.icon aria-hidden className="size-3.5" /> {c.name} <Count n={counts[c.id] ?? 0} />
          </Chip>
        ))}
        <Chip active={onlyFavorites} onClick={() => update({ favorites: onlyFavorites ? null : "1", category: null })}>
          <Star aria-hidden className="size-3.5" /> Favorites <Count n={favorites.length} />
        </Chip>
      </div>

      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite" role="status">
        {visible.length} tool{visible.length === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}
      </p>

      {visible.length > 0 ? (
        <ToolGrid tools={visible} className="mt-4" />
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">{onlyFavorites ? "No favorites yet." : "No tools match your search."}</p>
          <p className="mt-1 text-sm text-muted-foreground">{onlyFavorites ? "Tap the star on any tool to save it here." : "Try a different word, or ask for the tool you need."}</p>
          {!onlyFavorites ? (
            <Button className="mt-4" variant="primary" onClick={() => router.push("/requests")}>
              Request a tool
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Chip({ active, children, onClick, disabled }: { active: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-xs tabular-nums">{n}</span>;
}
