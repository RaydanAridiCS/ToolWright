import type { MetadataRoute } from "next";
import { CATEGORIES, tools } from "@toolwright/tools";
import { absoluteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tools"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...CATEGORIES.map((c) => ({ url: absoluteUrl(`/category/${c.id}`), lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...tools.map((t) => ({ url: absoluteUrl(`/tools/${t.slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: t.popular ? 0.9 : 0.8 })),
    { url: absoluteUrl("/requests"), lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: absoluteUrl("/privacy"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: absoluteUrl("/contribute"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];
}
