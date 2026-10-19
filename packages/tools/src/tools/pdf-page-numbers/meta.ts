import { ListOrdered } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "pdf-page-numbers",
  name: "Add Page Numbers to PDF",
  tagline: "Stamp page numbers on every page of a PDF.",
  description: "Add page numbers to a PDF in the position, format and starting number you choose (1, 1 of N, or Page 1). Runs in your browser; your document is never uploaded.",
  category: "pdf",
  keywords: ["add page numbers to pdf", "number pdf pages", "pdf pagination", "page numbering", "footer page number"],
  icon: ListOrdered,
  related: ["pdf-watermark", "merge-pdf", "pdf-metadata-editor"],
});
