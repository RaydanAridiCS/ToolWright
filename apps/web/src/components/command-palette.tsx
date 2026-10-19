"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CornerDownLeft, FolderOpen, Home, Lightbulb, Search, Star, History, ShieldCheck, LayoutGrid, type LucideIcon } from "lucide-react";
import { Kbd } from "@toolwright/ui";
import { CATEGORIES, getTool, popularTools, searchTools, tools, type ToolMeta } from "@toolwright/tools";
import { FAVORITES_KEY, RECENTS_KEY, useLocalList } from "../lib/local-list";

export const OPEN_PALETTE_EVENT = "tw:open-palette";

interface Page {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords: string;
}

const PAGES: Page[] = [
  { label: "Home", href: "/", icon: Home, keywords: "start main" },
  { label: "All tools", href: "/tools", icon: LayoutGrid, keywords: "browse list catalogue" },
  { label: "Request a tool", href: "/requests", icon: Lightbulb, keywords: "suggest idea vote feature" },
  { label: "How privacy works", href: "/privacy", icon: ShieldCheck, keywords: "security data trust verify" },
  { label: "Contribute", href: "/contribute", icon: FolderOpen, keywords: "open source github add tool" },
];

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground outline-none data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground";
const headingClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

function ToolItem({ tool, onSelect, hint }: { tool: ToolMeta; onSelect: () => void; hint?: LucideIcon }) {
  const Icon = tool.icon;
  const Hint = hint;
  return (
    <Command.Item value={tool.slug} onSelect={onSelect} className={itemClass}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{tool.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{tool.tagline}</span>
      </span>
      {Hint ? <Hint aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /> : null}
    </Command.Item>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const favorites = useLocalList(FAVORITES_KEY);
  const recents = useLocalList(RECENTS_KEY);

  const toggle = useCallback((next?: boolean) => {
    setOpen((current) => (typeof next === "boolean" ? next : !current));
    setQuery("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle(true);
      }
    };
    const onOpen = () => toggle(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [toggle]);

  const go = (href: string) => {
    toggle(false);
    router.push(href);
  };

  const results = useMemo(() => (query.trim() ? searchTools(query, 14) : null), [query]);
  const favoriteTools = useMemo(() => favorites.map((s) => getTool(s)).filter((t): t is ToolMeta => Boolean(t)).slice(0, 6), [favorites]);
  const recentTools = useMemo(() => recents.map((s) => getTool(s)).filter((t): t is ToolMeta => Boolean(t)).slice(0, 5), [recents]);
  const pageMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PAGES.filter((p) => `${p.label} ${p.keywords}`.toLowerCase().includes(q)) : PAGES;
  }, [query]);
  const categoryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? CATEGORIES.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(q)) : [];
  }, [query]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => toggle(next)}
      label="Search tools"
      shouldFilter={false}
      loop
      overlayClassName="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <Command.Input value={query} onValueChange={setQuery} placeholder={`Search ${tools.length} tools…`} className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={`max-h-[min(26rem,60vh)] overflow-y-auto p-2 ${headingClass}`}>
        <Command.Empty className="px-4 py-10 text-center text-sm text-muted-foreground">
          No tools match &ldquo;{query}&rdquo;.{" "}
          <button type="button" className="font-medium text-primary underline" onClick={() => go("/requests")}>
            Request it
          </button>
        </Command.Empty>

        {results ? (
          <Command.Group heading="Tools">
            {results.map(({ tool }) => (
              <ToolItem key={tool.slug} tool={tool} onSelect={() => go(`/tools/${tool.slug}`)} />
            ))}
          </Command.Group>
        ) : (
          <>
            {favoriteTools.length > 0 ? (
              <Command.Group heading="Favorites">
                {favoriteTools.map((tool) => (
                  <ToolItem key={tool.slug} tool={tool} hint={Star} onSelect={() => go(`/tools/${tool.slug}`)} />
                ))}
              </Command.Group>
            ) : null}
            {recentTools.length > 0 ? (
              <Command.Group heading="Recent">
                {recentTools.map((tool) => (
                  <ToolItem key={tool.slug} tool={tool} hint={History} onSelect={() => go(`/tools/${tool.slug}`)} />
                ))}
              </Command.Group>
            ) : null}
            <Command.Group heading="Popular">
              {popularTools(6).map((tool) => (
                <ToolItem key={tool.slug} tool={tool} onSelect={() => go(`/tools/${tool.slug}`)} />
              ))}
            </Command.Group>
          </>
        )}

        {categoryMatches.length > 0 ? (
          <Command.Group heading="Categories">
            {categoryMatches.map((c) => (
              <Command.Item key={c.id} value={`category-${c.id}`} onSelect={() => go(`/category/${c.id}`)} className={itemClass}>
                <c.icon aria-hidden className="size-4 text-muted-foreground" /> {c.name}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {pageMatches.length > 0 ? (
          <Command.Group heading="Pages">
            {pageMatches.map((p) => (
              <Command.Item key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)} className={itemClass}>
                <p.icon aria-hidden className="size-4 text-muted-foreground" /> {p.label}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="flex items-center gap-1.5">
          <CornerDownLeft aria-hidden className="size-3" /> to open
        </span>
      </div>
    </Command.Dialog>
  );
}

/**
 * Opens the palette. Buttons with visible text are named by that text; icon-only buttons pass `label`.
 * (An aria-label that differs from the visible text would break "Label in Name", WCAG 2.5.3.)
 */
export function SearchButton({ className, children, label }: { className?: string; children?: React.ReactNode; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} aria-label={label} aria-keyshortcuts="Control+K Meta+K">
      {children}
    </button>
  );
}
