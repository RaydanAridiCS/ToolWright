import { FileText } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "pdf-metadata-editor",
  name: "PDF Metadata Viewer & Editor",
  tagline: "See, edit or strip a PDF's title, author, dates and producer.",
  description:
    "Inspect the hidden metadata inside a PDF (title, author, subject, keywords, creator, producer and dates), edit it, or remove all of it before sharing. Processed in your browser; the file is never uploaded.",
  category: "pdf",
  keywords: ["pdf metadata", "edit pdf properties", "remove pdf metadata", "pdf author", "pdf info", "strip pdf metadata"],
  icon: FileText,
  related: ["exif-remover", "merge-pdf", "pdf-watermark"],
});
