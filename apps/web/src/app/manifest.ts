import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name}: private online tools`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f9fe",
    theme_color: "#4338ca",
    categories: ["utilities", "productivity", "developer"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "All tools", url: "/tools" },
      { name: "Merge PDF", url: "/tools/merge-pdf" },
      { name: "JSON Formatter", url: "/tools/json-formatter" },
    ],
  };
}
