import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_BY_ID, isCategoryId, toolsByCategory } from "@toolwright/tools";
import { JsonLd } from "../../../components/json-ld";
import { Ledger } from "../../../components/ledger";
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
  const drawerNo = String(CATEGORIES.findIndex((x) => x.id === c.id) + 1).padStart(2, "0");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${c.name} tools`,
          url: absoluteUrl(`/category/${c.id}`),
          mainEntity: { "@type": "ItemList", itemListElement: list.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/tools/${t.slug}`), name: t.name })) },
        }}
      />
      <nav aria-label="Breadcrumb" className="label-plate flex items-center gap-2">
        <Link href="/tools" className="hover:bg-marker hover:text-marker-foreground">
          Tools
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="text-foreground">
          {c.name}
        </span>
      </nav>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-6 border-b-2 border-foreground pb-8">
        <div>
          <p className="label-plate mb-3">Drawer {drawerNo}</p>
          <h1 className="font-display text-[clamp(2.8rem,7vw,6rem)] font-extrabold leading-[0.9] tracking-[-0.03em]">{c.name}</h1>
          <p className="mt-4 max-w-xl text-lg">{c.description}</p>
        </div>
        <p className="font-display text-[clamp(4rem,10vw,8rem)] font-extrabold leading-none tabular-nums text-primary" aria-label={`${list.length} tools`}>
          {String(list.length).padStart(2, "0")}
        </p>
      </header>

      <Ledger tools={list} sequential={false} glyphs className="border-t-0" />

      <nav aria-label="Other drawers" className="mt-16">
        <h2 className="label-plate mb-3 text-foreground">Other drawers</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-foreground pt-4">
          {CATEGORIES.filter((x) => x.id !== c.id).map((x) => (
            <li key={x.id}>
              <Link href={`/category/${x.id}`} className="font-display text-xl font-bold hover:bg-marker hover:text-marker-foreground">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
