import { Landmark } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "roman-numerals",
  name: "Roman Numeral Converter",
  tagline: "Convert numbers to Roman numerals and back (1–3999).",
  description: "Type a number to get its Roman numeral, or a Roman numeral to get the number. Enter one value per line to convert a whole list. Runs in your browser.",
  category: "calculators",
  keywords: ["roman numerals", "roman numeral converter", "number to roman", "roman to number", "mcmxciv"],
  icon: Landmark,
  related: ["number-to-words", "number-base-converter", "prime-factors"],
});
