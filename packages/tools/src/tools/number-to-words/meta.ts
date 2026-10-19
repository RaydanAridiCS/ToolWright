import { Type } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "number-to-words",
  name: "Number to Words",
  tagline: "Spell out numbers in English, up to the quintillions.",
  description: "Convert numbers such as 1,234,567 into words (one million two hundred thirty-four thousand five hundred sixty-seven). Useful for cheques, contracts and invoices. Local only.",
  category: "calculators",
  keywords: ["number to words", "spell number", "numbers in words", "cheque amount in words", "convert number to text"],
  icon: Type,
  related: ["roman-numerals", "number-base-converter", "prime-factors"],
});
