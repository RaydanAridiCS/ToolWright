import Link from "next/link";
import { ArrowRight, Code2, EyeOff, Github, Lightbulb, Lock, Search, WifiOff } from "lucide-react";
import { Kbd, buttonClasses } from "@toolwright/ui";
import { categoriesWithCounts, popularTools, tools } from "@toolwright/tools";
import { SearchButton } from "../components/command-palette";
import { ToolGrid } from "../components/tool-card";
import { YourTools } from "../components/your-tools";
import { SITE } from "../lib/site";

const PILLARS = [
  {
    icon: Lock,
    title: "Your data stays on your device",
    body: "Every tool runs inside your browser. Files, text and passwords are processed locally and never uploaded. Our page can't even connect to other servers.",
  },
  {
    icon: Code2,
    title: "Open source, no strings",
    body: "The whole project is public under the MIT license. Read the code, check how a tool works, fix a bug or add the tool you wish existed.",
  },
  {
    icon: EyeOff,
    title: "No accounts, no tracking scripts",
    body: "Open a tool and use it. There is nothing to sign up for, no ads watching you, and no limits on file size or number of uses.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    body: "Tools you have opened keep working without a connection. Install Toolwright as an app from your browser menu.",
  },
] as const;

export default function HomePage() {
  const categories = categoriesWithCounts();
  return (
    <>
      <section className="hero-bg relative isolate overflow-hidden border-b border-border/60">
        <div aria-hidden className="grid-fade pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-success" /> Free · Open source · Private by design
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Tools that <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">never see</span> your data.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
            {tools.length}+ everyday tools for developers, designers and everyone else: format JSON, merge PDFs, compress images, generate passwords. All running privately in your browser.
          </p>

          <SearchButton className="mx-auto mt-9 flex h-14 w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-card px-5 text-left text-base text-muted-foreground shadow-lg shadow-primary/5 transition-all hover:border-primary/50 hover:shadow-primary/10">
            <Search aria-hidden className="size-5 text-primary" />
            <span className="flex-1">Search {tools.length} tools…</span>
            <Kbd className="hidden sm:inline">Ctrl K</Kbd>
          </SearchButton>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/tools" className={buttonClasses("primary", "lg")}>
              Browse all tools <ArrowRight aria-hidden />
            </Link>
            <a href={SITE.repo} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "lg")}>
              <Github aria-hidden /> View on GitHub
            </a>
          </div>
        </div>
      </section>

      <YourTools />

      <section aria-labelledby="popular" className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="popular" className="text-2xl font-bold tracking-tight">
              Popular tools
            </h2>
            <p className="mt-1 text-muted-foreground">The ones people reach for every day.</p>
          </div>
          <Link href="/tools" className="hidden text-sm font-medium text-primary hover:underline sm:inline">
            See all {tools.length} →
          </Link>
        </div>
        <ToolGrid tools={popularTools(12)} />
      </section>

      <section aria-labelledby="categories" className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
        <h2 id="categories" className="text-2xl font-bold tracking-tight">
          Browse by category
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/category/${c.id}`} className="group flex h-full items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  <c.icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold">
                    {c.name}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{c.count}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{c.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="why" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12">
          <h2 id="why" className="max-w-2xl text-3xl font-bold tracking-tight">
            Most &ldquo;free online tools&rdquo; quietly upload your files. We built the opposite.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Toolwright does the work on your device, and the browser itself enforces it. You don&rsquo;t have to take our word for it.{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              See how to verify it yourself
            </Link>
            .
          </p>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon aria-hidden className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="cta" className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <div className="hero-bg flex flex-col items-start justify-between gap-6 rounded-3xl border border-border p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 id="cta" className="text-2xl font-bold tracking-tight">
              Missing a tool? Tell us, or build it.
            </h2>
            <p className="mt-1 max-w-xl text-muted-foreground">Vote on what we build next, or add your own tool: each one is a single folder, and the contributor guide walks you through it.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href="/requests" className={buttonClasses("primary", "md")}>
              <Lightbulb aria-hidden /> Request a tool
            </Link>
            <Link href="/contribute" className={buttonClasses("outline", "md")}>
              Contribute
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
