import { Replace } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "csv-delimiter-converter",
  name: "CSV Delimiter Converter",
  tagline: "Switch between comma, tab, semicolon and pipe separated values.",
  description: "Change the delimiter of CSV data (for example comma to tab, or semicolon to comma for European Excel exports) while keeping quoting intact. Everything runs in your browser.",
  category: "data",
  keywords: ["csv to tsv", "tsv to csv", "change csv delimiter", "semicolon to comma", "csv separator"],
  icon: Replace,
  related: ["json-csv-converter", "csv-to-markdown", "line-tools"],
});
