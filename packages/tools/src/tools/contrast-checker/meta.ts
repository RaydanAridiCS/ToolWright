import { Contrast } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "contrast-checker",
  name: "WCAG Contrast Checker",
  tagline: "Check text and background contrast against WCAG AA and AAA.",
  description:
    "Enter a foreground and background color to see the exact WCAG contrast ratio and whether it passes AA and AAA for normal and large text. Includes a live text preview. Works offline in your browser.",
  category: "design",
  keywords: ["contrast checker", "wcag contrast", "accessibility color", "color contrast ratio", "aa aaa", "a11y"],
  icon: Contrast,
  popular: true,
  faq: [
    { question: "What ratios do WCAG AA and AAA require?", answer: "AA needs 4.5:1 for normal text and 3:1 for large text (18pt, or 14pt bold). AAA needs 7:1 for normal text and 4.5:1 for large text." },
  ],
  related: ["color-converter", "palette-generator", "image-color-picker"],
});
