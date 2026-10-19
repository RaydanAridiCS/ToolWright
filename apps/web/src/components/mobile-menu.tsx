"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@toolwright/ui";

export function MobileMenu({ links }: { links: readonly { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
      </Button>
      {open ? (
        <nav id={panelId} aria-label="Mobile" className="absolute inset-x-0 top-16 border-b border-border bg-background/95 p-3 shadow-lg backdrop-blur-xl">
          <ul className="mx-auto flex max-w-7xl flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded-lg px-4 py-3 text-base font-medium hover:bg-muted">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
