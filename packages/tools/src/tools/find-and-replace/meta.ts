import { Replace } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "find-and-replace",
  name: "Find & Replace",
  tagline: "Bulk find and replace text with optional regular expressions.",
  description:
    "Search and replace across any amount of text with case, whole-word and regular-expression options. Capture groups like $1 work in regex mode. Runs locally in your browser.",
  category: "text",
  keywords: ["find and replace", "search and replace", "regex replace", "bulk replace", "text replace"],
  icon: Replace,
  related: ["regex-tester", "line-tools", "case-converter"],
});
