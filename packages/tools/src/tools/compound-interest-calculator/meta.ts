import { TrendingUp } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "compound-interest-calculator",
  name: "Compound Interest Calculator",
  tagline: "See how savings and investments grow with regular contributions.",
  description:
    "Project the growth of a deposit or investment with compound interest and optional regular contributions. Choose compounding frequency and see year-by-year balances. Illustrative only; calculated in your browser.",
  category: "calculators",
  keywords: ["compound interest calculator", "savings calculator", "investment growth", "interest calculator", "future value"],
  icon: TrendingUp,
  related: ["loan-calculator", "percentage-calculator", "tip-calculator"],
});
