import { Megaphone } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "utm-builder",
  name: "UTM Link Builder",
  tagline: "Add campaign tracking parameters to any URL.",
  description: "Build campaign URLs with utm_source, utm_medium, utm_campaign, utm_term and utm_content. Existing query parameters and fragments are preserved, and links are built locally.",
  category: "developer",
  keywords: ["utm builder", "campaign url builder", "utm generator", "google analytics utm", "tracking link"],
  icon: Megaphone,
  related: ["url-cleaner", "url-parser", "qr-code-generator"],
});
