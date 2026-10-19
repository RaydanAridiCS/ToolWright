import { ShieldCheck } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "url-cleaner",
  name: "URL Tracking Remover",
  tagline: "Strip utm_*, fbclid, gclid and other tracking parameters from links.",
  description: "Clean links before you share them. Removes common tracking parameters (utm_*, fbclid, gclid, msclkid, mc_eid and more) while keeping the parameters that matter. One URL per line.",
  category: "developer",
  keywords: ["remove utm", "strip tracking parameters", "clean url", "remove fbclid", "link cleaner"],
  icon: ShieldCheck,
  related: ["utm-builder", "url-parser", "url-encoder"],
});
