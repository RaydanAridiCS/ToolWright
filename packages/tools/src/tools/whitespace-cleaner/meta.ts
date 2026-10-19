import { Eraser } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "whitespace-cleaner",
  name: "Remove Extra Spaces & Line Breaks",
  tagline: "Collapse spaces, trim lines and remove blank lines.",
  description:
    "Fix messy pasted text by collapsing repeated spaces, trimming each line, collapsing blank lines or joining everything onto one line. All processing happens locally.",
  category: "text",
  keywords: ["remove extra spaces", "remove line breaks", "trim whitespace", "clean text", "strip newlines"],
  icon: Eraser,
  related: ["line-tools", "find-and-replace", "word-counter"],
});
