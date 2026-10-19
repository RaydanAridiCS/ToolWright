import { Link2 } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "url-encoder",
  name: "URL Encoder & Decoder",
  tagline: "Percent-encode or decode URLs and query strings.",
  description:
    "Encode text for safe use in URLs or decode percent-escaped strings. Choose component mode for query values or full-URL mode to keep :/?# intact. Runs in your browser.",
  category: "encoding",
  keywords: ["url encode", "url decode", "percent encoding", "encodeURIComponent", "query string encoder"],
  icon: Link2,
  popular: true,
  related: ["url-parser", "base64-encoder", "html-entities"],
});
