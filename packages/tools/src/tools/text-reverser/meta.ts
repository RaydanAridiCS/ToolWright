import { ArrowLeftRight } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "text-reverser",
  name: "Text Reverser",
  tagline: "Reverse characters or word order, emoji-safe.",
  description: "Reverse a string character by character or flip the order of its words. Emoji and combined characters stay intact. Runs entirely in your browser.",
  category: "text",
  keywords: ["reverse text", "reverse string", "backwards text", "flip text", "reverse words"],
  icon: ArrowLeftRight,
  related: ["case-converter", "line-tools", "text-ciphers"],
});
