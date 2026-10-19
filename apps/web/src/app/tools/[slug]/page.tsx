import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Lock, ShieldCheck, WifiOff } from "lucide-react";
import { Badge } from "@toolwright/ui";
import { CATEGORY_BY_ID, getTool, relatedTools, tools } from "@toolwright/tools";
import { FavoriteButton } from "../../../components/favorite-button";
import { JsonLd } from "../../../components/json-ld";
import { ToolGrid } from "../../../components/tool-card";
import { ToolLoader } from "../../../components/tool-loader";
import { SITE, absoluteUrl } from "../../../lib/site";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  const title = `${tool.name}: Free & Private Online Tool`;
  return {
    title,
    description: tool.description,
    keywords: tool.keywords,
    alternates: { canonical: `/tools/${tool.slug}` },
    openGraph: { type: "website", title, description: tool.description, url: absoluteUrl(`/tools/${tool.slug}`), siteName: SITE.name },
    twitter: { card: "summary_large_image", title, description: tool.description },
  };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const category = CATEGORY_BY_ID[tool.category];
  const related = relatedTools(tool.slug, 4);
  const Icon = tool.icon;
  const url = absoluteUrl(`/tools/${tool.slug}`);

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: tool.name,
      url,
      description: tool.description,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any (runs in a web browser)",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      browserRequirements: "Requires a modern web browser with JavaScript",
      license: "https://opensource.org/licenses/MIT",
      publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: category.name, item: absoluteUrl(`/category/${category.id}`) },
        { "@type": "ListItem", position: 3, name: tool.name, item: url },
      ],
    },
  ];
  if (tool.faq?.length) {
    structured.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: tool.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
    });
  }
  if (tool.howTo?.length) {
    structured.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: `How to use ${tool.name}`,
      step: tool.howTo.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={structured} />

      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <Link href={`/category/${category.id}`} className="hover:text-foreground">
          {category.name}
        </Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <span aria-current="page" className="text-foreground">
          {tool.name}
        </span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon aria-hidden className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{tool.name}</h1>
            <p className="mt-2 max-w-3xl text-pretty text-muted-foreground">{tool.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/category/${category.id}`}>
                <Badge tone="primary">{category.name}</Badge>
              </Link>
              <Badge tone="success">
                <Lock aria-hidden className="size-3" /> Runs in your browser
              </Badge>
              <Badge>
                <WifiOff aria-hidden className="size-3" /> Works offline once loaded
              </Badge>
            </div>
          </div>
        </div>
        <FavoriteButton slug={tool.slug} name={tool.name} withLabel />
      </header>

      <section aria-label={tool.name} className="mt-8 rounded-2xl border border-border bg-card/60 p-4 shadow-sm sm:p-6">
        <ToolLoader slug={tool.slug} />
        <noscript>
          <p className="p-4 text-sm">This tool needs JavaScript to run in your browser. Nothing is sent to a server.</p>
        </noscript>
      </section>

      <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          Private by design: your input is processed on this device and never uploaded.{" "}
          <Link href="/privacy" className="font-medium text-primary hover:underline">
            Verify it yourself
          </Link>
          .
        </span>
      </p>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-12">
          {tool.howTo?.length ? (
            <section aria-labelledby="how-to">
              <h2 id="how-to" className="text-xl font-semibold">
                How to use {tool.name}
              </h2>
              <ol className="mt-4 flex flex-col gap-3">
                {tool.howTo.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {tool.faq?.length ? (
            <section aria-labelledby="faq">
              <h2 id="faq" className="text-xl font-semibold">
                Frequently asked questions
              </h2>
              <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
                {tool.faq.map((f) => (
                  <details key={f.question} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                      {f.question}
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-2 text-muted-foreground">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="keywords" className="text-sm">
          <h2 id="keywords" className="font-semibold">
            Also searched as
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tool.keywords.map((k) => (
              <li key={k} className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                {k}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related" className="mt-16">
          <h2 id="related" className="mb-5 text-xl font-semibold">
            Related tools
          </h2>
          <ToolGrid tools={related} showCategory={false} />
        </section>
      ) : null}
    </div>
  );
}
