import { FileX } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "delete-pdf-pages",
  name: "Delete PDF Pages",
  tagline: "Remove unwanted pages from a PDF.",
  description: "Delete blank, duplicate or sensitive pages from a PDF by entering the page numbers or ranges to remove. The rest of the document is untouched. Done locally in your browser.",
  category: "pdf",
  keywords: ["delete pdf pages", "remove pages from pdf", "remove blank pages pdf", "cut pages pdf", "pdf page remover"],
  icon: FileX,
  related: ["extract-pdf-pages", "split-pdf", "merge-pdf"],
});
