import { CalendarClock } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "timestamp-converter",
  name: "Unix Timestamp Converter",
  tagline: "Convert Unix timestamps to dates and back, in any time zone.",
  description:
    "Convert epoch timestamps in seconds, milliseconds, microseconds or nanoseconds to human-readable dates, and dates back to timestamps. Shows ISO 8601, UTC, relative time and any IANA time zone, with a live clock. Runs in your browser.",
  category: "developer",
  keywords: ["unix timestamp", "epoch converter", "timestamp to date", "date to timestamp", "epoch time", "unix time now"],
  icon: CalendarClock,
  popular: true,
  faq: [
    { question: "How does it know if a number is seconds or milliseconds?", answer: "By magnitude: values below 100 billion are treated as seconds, then milliseconds, microseconds and nanoseconds as the numbers grow. The detected unit is shown." },
  ],
  related: ["time-zone-converter", "date-calculator", "cron-explainer"],
});
