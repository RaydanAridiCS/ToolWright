import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plate, StatusLine } from "@toolwright/ui";
import { CATEGORY_BY_ID, getTool, relatedTools, tools } from "@toolwright/tools";
import { FavoriteButton } from "../../../components/favorite-button";
import { JsonLd } from "../../../components/json-ld";
import { Ledger, catalogueNumber } from "../../../components/ledger";
import { NetworkLedger } from "../../../components/network-ledger";
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

const crumb = "hover:bg-marker hover:text-marker-foreground";

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const category = CATEGORY_BY_ID[tool.category];
  const related = relatedTools(tool.slug, 4);
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <JsonLd data={structured} />

      <nav aria-label="Breadcrumb" className="label-plate flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href="/tools" className={crumb}>
          Tools
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/category/${category.id}`} className={crumb}>
          {category.name}
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="text-foreground">
          {tool.name}
        </span>
      </nav>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0 max-w-4xl">
          <h1 className="font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.028em]">{tool.name}</h1>
          <p className="mt-5 max-w-[62ch] text-lg leading-relaxed">{tool.description}</p>
        </div>
        <FavoriteButton slug={tool.slug} name={tool.name} withLabel />
      </header>

      <Plate
        aria-label={tool.name}
        label={`Tool ${catalogueNumber(tool.slug)} · ${category.name}`}
        className="mt-10"
        footer={
          <StatusLine>
            <NetworkLedger />
            <span>Runs on this device</span>
            <span>Works offline once opened</span>
          </StatusLine>
        }
      >
        <ToolLoader slug={tool.slug} />
        <noscript>
          <p className="p-4 text-sm">This tool needs JavaScript to run in your browser. Nothing is sent to a server.</p>
        </noscript>
      </Plate>

      <div className="mt-20 grid gap-14 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-16">
          {tool.howTo?.length ? (
            <section aria-labelledby="how-to">
              <h2 id="how-to" className="font-display text-3xl font-extrabold tracking-tight">
                How to use {tool.name}
              </h2>
              <ol className="mt-6 border-t border-foreground">
                {tool.howTo.map((step, i) => (
                  <li key={step} className="flex items-baseline gap-5 border-b border-border py-4">
                    <span aria-hidden className="font-display text-5xl font-extrabold leading-none tabular-nums text-primary">
                      {i + 1}
                    </span>
                    <span className="text-lg">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {tool.faq?.length ? (
            <section aria-labelledby="faq">
              <h2 id="faq" className="font-display text-3xl font-extrabold tracking-tight">
                Frequently asked questions
              </h2>
              <div className="mt-6 border-t border-foreground">
                {tool.faq.map((f) => (
                  <details key={f.question} className="group border-b border-border py-4">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 text-lg font-semibold hover:bg-marker hover:text-marker-foreground [&::-webkit-details-marker]:hidden">
                      {f.question}
                      <span aria-hidden className="font-mono text-xl font-medium">
                        <span className="group-open:hidden">+</span>
                        <span className="hidden group-open:inline">–</span>
                      </span>
                    </summary>
                    <p className="mt-3 max-w-[62ch] text-muted-foreground">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="keywords">
          <h2 id="keywords" className="label-plate text-foreground">
            Also searched as
          </h2>
          <p className="mt-3 border-t border-foreground pt-3 text-sm leading-relaxed text-muted-foreground">{tool.keywords.join(" · ")}</p>
        </aside>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related" className="mt-20">
          <h2 id="related" className="mb-5 font-display text-3xl font-extrabold tracking-tight">
            Related tools
          </h2>
          <Ledger tools={related} sequential={false} compact showCategory={false} />
        </section>
      ) : null}
    </div>
  );
}
