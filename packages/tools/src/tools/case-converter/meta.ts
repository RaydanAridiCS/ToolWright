import { CaseSensitive } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "case-converter",
  name: "Case Converter",
  tagline: "camelCase, snake_case, Title Case, UPPER CASE and more.",
  description:
    "Convert text between camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, dot.case, Title Case, Sentence case, UPPER and lower case. Multi-line input is converted line by line, entirely in your browser.",
  category: "text",
  keywords: ["camelcase", "snake case", "kebab case", "title case", "uppercase", "lowercase", "pascal case", "text case"],
  icon: CaseSensitive,
  popular: true,
  related: ["slug-generator", "line-tools", "word-counter"],
});
