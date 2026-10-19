import { Sigma } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "word-frequency",
  name: "Word Frequency Counter",
  tagline: "See which words appear most often in your text.",
  description: "Rank the words in any text by how often they appear. Useful for editing, SEO keyword checks and spotting overused words. Runs in your browser.",
  category: "text",
  keywords: ["word frequency", "keyword density", "most common words", "word occurrences", "repeated words"],
  icon: Sigma,
  related: ["word-counter", "line-tools", "case-converter"],
});
