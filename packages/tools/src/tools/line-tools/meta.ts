import { ListOrdered } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "line-tools",
  name: "Sort & Dedupe Lines",
  tagline: "Sort, shuffle, reverse, trim and remove duplicate lines.",
  description:
    "Clean up lists in seconds: sort lines alphabetically, naturally or by length, remove duplicates and blank lines, trim whitespace, reverse or shuffle the order. Nothing is uploaded.",
  category: "text",
  keywords: ["sort lines", "remove duplicate lines", "dedupe", "alphabetize", "shuffle lines", "unique lines", "remove blank lines"],
  icon: ListOrdered,
  popular: true,
  related: ["find-and-replace", "whitespace-cleaner", "word-frequency"],
});
