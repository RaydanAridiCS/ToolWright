import { Code } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "html-entities",
  name: "HTML Entity Encoder & Decoder",
  tagline: "Escape &, <, > and quotes, or decode HTML entities.",
  description:
    "Escape special characters into HTML entities for safe embedding in markup, or decode named, decimal and hexadecimal entities such as &amp;, &copy; and &#x1F600;. Local only.",
  category: "encoding",
  keywords: ["html entities", "html escape", "html unescape", "escape html", "decode html entities"],
  icon: Code,
  related: ["url-encoder", "string-escape", "markdown-preview"],
});
