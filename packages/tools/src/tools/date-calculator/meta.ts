import { CalendarDays } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "date-calculator",
  name: "Date Calculator",
  tagline: "Days between dates, add or subtract time, age and business days.",
  description: "Find the exact difference between two dates in years, months and days, add or subtract time from a date, calculate someone's age and next birthday, and count business days. All in your browser.",
  category: "calculators",
  keywords: ["date calculator", "days between dates", "add days to date", "age calculator", "business days", "date difference"],
  icon: CalendarDays,
  popular: true,
  related: ["timestamp-converter", "time-zone-converter", "cron-explainer"],
});
