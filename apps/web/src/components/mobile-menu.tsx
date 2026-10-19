"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@toolwright/ui";
import { SITE } from "../lib/site";

interface MenuLink {
  href: string;
  label: string;
  note?: string;
}

/** On phones the menu is a full-screen numbered index, with big touch targets. */
export function MobileMenu({ links }: { links: readonly MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
      </Button>
      {open ? (
        <nav id={panelId} aria-label="Mobile" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-foreground bg-background">
          <ol className="mx-auto max-w-7xl px-4">
            {links.map((l, i) => (
              <li key={l.href} className="border-b border-border">
                <Link href={l.href} className="flex min-h-16 items-baseline gap-4 py-4 hover:bg-marker hover:text-marker-foreground">
                  <span className="label-plate w-6 text-inherit">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display text-4xl font-extrabold tracking-tight">{l.label}</span>
                  {l.note ? <sup className="font-mono text-xs text-muted-foreground">{l.note}</sup> : null}
                </Link>
              </li>
            ))}
            <li>
              <a href={SITE.repo} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-4 py-4 text-sm font-semibold hover:bg-marker hover:text-marker-foreground">
                <span className="w-6" /> GitHub <span aria-hidden>↗</span>
              </a>
            </li>
          </ol>
        </nav>
      ) : null}
    </div>
  );
}
