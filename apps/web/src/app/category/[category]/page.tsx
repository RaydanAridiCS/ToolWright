import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_BY_ID, isCategoryId, toolsByCategory } from "@toolwright/tools";
import { JsonLd } from "../../../components/json-ld";
import { ToolGrid } from "../../../components/tool-card";
import { absoluteUrl } from "../../../lib/site";

interface Props {
  params: Promise<{ category: string }>;
}

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  if (!isCategoryId(category)) return {};
  const c = CATEGORY_BY_ID[category];
  const count = toolsByCategory(category).length;
  return {
    title: `${c.name} tools`,
    description: `${count} free, private ${c.name.toLowerCase()} tools that run in your browser. ${c.description}`,
    alternates: { canonical: `/category/${c.id}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  if (!isCategoryId(category)) notFound();
  const c = CATEGORY_BY_ID[category];
  const list = toolsByCategory(category);
  const Icon = c.icon;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${c.name} tools`,
          url: absoluteUrl(`/category/${c.id}`),
          mainEntity: { "@type": "ItemList", itemListElement: list.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/tools/${t.slug}`), name: t.name })) },
        }}
      />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/tools" className="hover:text-foreground">
          All tools
        </Link>{" "}
        / <span className="text-foreground">{c.name}</span>
      </nav>
      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <Icon aria-hidden className="size-7" />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{c.name} tools</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {c.description} {list.length} tools, all private and free.
          </p>
        </div>
      </div>
      <ToolGrid tools={list} className="mt-10" showCategory={false} />

      <h2 className="mb-4 mt-16 text-lg font-semibold">Other categories</h2>
      <ul className="flex flex-wrap gap-2">
        {CATEGORIES.filter((x) => x.id !== c.id).map((x) => (
          <li key={x.id}>
            <Link href={`/category/${x.id}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary/40 hover:bg-primary/5">
              <x.icon aria-hidden className="size-4 text-muted-foreground" /> {x.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
