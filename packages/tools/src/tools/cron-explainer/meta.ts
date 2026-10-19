import { Clock } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "cron-explainer",
  name: "Cron Expression Explainer",
  tagline: "Translate cron schedules into plain English and see the next runs.",
  description:
    "Paste a cron expression to read it in plain English and list its next scheduled runs in UTC or your local time. Supports ranges, lists, steps, month and weekday names, and shortcuts like @daily. Runs in your browser.",
  category: "developer",
  keywords: ["cron expression", "crontab", "cron generator", "cron explainer", "cron schedule", "next run"],
  icon: Clock,
  popular: true,
  related: ["timestamp-converter", "time-zone-converter", "regex-tester"],
});
