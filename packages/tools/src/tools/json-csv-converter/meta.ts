import { FileSpreadsheet } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "json-csv-converter",
  name: "JSON to CSV Converter",
  tagline: "Turn JSON arrays into CSV and CSV into JSON.",
  description:
    "Convert an array of JSON objects to CSV (nested objects are flattened to dotted columns) or parse CSV and TSV into typed JSON. Choose delimiters and headers. Large files are handled locally in your browser.",
  category: "data",
  keywords: ["json to csv", "csv to json", "convert csv", "json to excel", "tsv to json", "flatten json"],
  icon: FileSpreadsheet,
  popular: true,
  related: ["json-yaml-converter", "csv-to-markdown", "csv-delimiter-converter"],
});
