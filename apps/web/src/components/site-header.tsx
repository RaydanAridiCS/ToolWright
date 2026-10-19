import Link from "next/link";
import { Github, Search } from "lucide-react";
import { Kbd, buttonClasses } from "@toolwright/ui";
import { tools } from "@toolwright/tools";
import { SITE } from "../lib/site";
import { Logo } from "./logo";
import { SearchButton } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { MobileMenu } from "./mobile-menu";

export const NAV_LINKS = [
  { href: "/tools", label: "All tools" },
  { href: "/requests", label: "Request a tool" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contribute", label: "Contribute" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="rounded-lg focus-visible:outline-2" aria-label="Toolwright home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <SearchButton className="hidden h-10 w-64 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/25 lg:flex">
            <Search aria-hidden className="size-4" />
            <span className="flex-1 text-left">Search {tools.length} tools…</span>
            <Kbd>Ctrl K</Kbd>
          </SearchButton>
          <SearchButton label="Search tools" className={buttonClasses("ghost", "icon", "lg:hidden")}>
            <Search aria-hidden />
          </SearchButton>
          <a href={SITE.repo} target="_blank" rel="noopener noreferrer" aria-label="Toolwright on GitHub" className={buttonClasses("ghost", "icon")}>
            <Github aria-hidden />
          </a>
          <ThemeToggle />
          <MobileMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
