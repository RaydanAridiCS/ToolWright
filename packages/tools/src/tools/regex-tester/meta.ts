import { Regex } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "regex-tester",
  name: "Regex Tester",
  tagline: "Test JavaScript regular expressions with live match highlighting.",
  description:
    "Write a regular expression and watch matches highlight live. See capture groups, named groups and positions, try replacements, and start from common presets such as email, URL and IP address. Uses your browser's JavaScript regex engine; nothing is uploaded.",
  category: "developer",
  keywords: ["regex tester", "regular expression", "regex101 alternative", "javascript regex", "regex match", "capture groups"],
  icon: Regex,
  popular: true,
  howTo: ["Enter a pattern and pick flags.", "Paste the text you want to test against.", "Matches highlight live; expand the list to see groups, or try a replacement."],
  related: ["find-and-replace", "text-diff", "cron-explainer"],
});
