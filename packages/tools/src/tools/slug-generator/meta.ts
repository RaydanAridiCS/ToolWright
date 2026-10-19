import { Link } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "slug-generator",
  name: "Slug Generator",
  tagline: "Turn titles into clean, URL-friendly slugs.",
  description:
    "Create SEO-friendly URL slugs from any text. Accents are removed, punctuation is dropped and words are joined with the separator you choose. One slug per line, generated in your browser.",
  category: "text",
  keywords: ["slugify", "url slug", "seo friendly url", "permalink", "kebab case"],
  icon: Link,
  related: ["case-converter", "url-encoder", "utm-builder"],
});
