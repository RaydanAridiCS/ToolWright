import { Pilcrow } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "lorem-ipsum",
  name: "Lorem Ipsum Generator",
  tagline: "Placeholder text by paragraph, sentence or word.",
  description: "Generate lorem ipsum placeholder text for mockups and layouts: paragraphs, sentences or words, optionally wrapped in HTML paragraph tags. Generated locally, no sign-up.",
  category: "generators",
  keywords: ["lorem ipsum", "placeholder text", "dummy text", "filler text", "sample text"],
  icon: Pilcrow,
  popular: true,
  related: ["word-counter", "unique-id-generator", "password-generator"],
});
