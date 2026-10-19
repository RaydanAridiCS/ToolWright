import Link from "next/link";
import { Github, Heart } from "lucide-react";
import { CATEGORIES, categoriesWithCounts } from "@toolwright/tools";
import { SITE } from "../lib/site";
import { Logo } from "./logo";

export function SiteFooter() {
  const categories = categoriesWithCounts();
  return (
    <footer className="mt-24 border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">
            Free, open-source tools that run entirely in your browser. No accounts, no uploads, no tracking scripts.
          </p>
          <a href={SITE.repo} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
            <Github aria-hidden className="size-4" /> Star us on GitHub
          </a>
        </div>

        <nav aria-label="Tool categories">
          <h2 className="text-sm font-semibold">Tools</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            {categories.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.id}`} className="hover:text-foreground">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="More categories">
          <h2 className="text-sm font-semibold">More tools</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            {CATEGORIES.slice(5).map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.id}`} className="hover:text-foreground">
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/tools" className="hover:text-foreground">
                Browse everything
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Project">
          <h2 className="text-sm font-semibold">Project</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/about" className="hover:text-foreground">
                About
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-foreground">
                How privacy works
              </Link>
            </li>
            <li>
              <Link href="/requests" className="hover:text-foreground">
                Request a tool
              </Link>
            </li>
            <li>
              <Link href="/contribute" className="hover:text-foreground">
                Contribute
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <p>
            © {new Date().getFullYear()} Toolwright. Released under the {SITE.license} license.
          </p>
          <p className="flex items-center gap-1.5">
            Built with <Heart aria-hidden className="size-3.5 fill-danger text-danger" /> for people who care about their data.
          </p>
        </div>
      </div>
    </footer>
  );
}
