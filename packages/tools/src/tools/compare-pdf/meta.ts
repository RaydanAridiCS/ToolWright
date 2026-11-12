import { GitCompare } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "compare-pdf",
  name: "Compare PDFs",
  tagline: "See what changed between two versions of a PDF, in the text and on the page.",
  description:
    "Drop an old and a new version of a PDF to see the lines that were added, removed or edited, with the changed words marked and the page numbers listed, and a page-by-page picture comparison that highlights what looks different. Runs in your browser; neither file is uploaded.",
  primaryKeyword: "compare pdf",
  seoTitle: "Compare PDF Files Online, No Upload",
  seoDescription:
    "Compare two PDFs and see what changed: added, removed and edited text with page numbers, plus a page-by-page visual difference. Free, and nothing is uploaded.",
  answer:
    "Compare PDF shows what changed between two versions of a document: the text that was added, removed or edited, which pages changed, and a visual difference for each page. It runs in your browser, so neither file is uploaded.",
  category: "pdf",
  keywords: ["compare pdf", "pdf diff", "compare two pdf files", "pdf difference checker", "compare pdf versions", "find changes between pdfs", "pdf comparison tool"],
  icon: GitCompare,
  howTo: [
    "Drop the original PDF in box A and the new version in box B.",
    "Read the text changes, or open Page pictures to see which pages look different.",
    "Click a changed page to see the difference highlighted, or copy the list of changes.",
  ],
  faq: [
    { question: "How do I compare two PDFs?", answer: "Drop the old version in A and the new version in B. The text changes appear straight away, and the Page pictures tab shows which pages differ visually." },
    { question: "Does it compare scanned PDFs?", answer: "Use the Page pictures tab. A scan has no text to compare, so the text view is empty, but the picture comparison works on any page. There is no OCR." },
    { question: "Why does a page show as changed when the text is the same?", answer: "The page picture comparison also catches changes to images, layout, colours and fonts, and pages of a different size are always reported as changed." },
    { question: "Are my files uploaded?", answer: "No. Both PDFs are read and compared in this tab, and nothing is sent anywhere." },
  ],
  nextStep: { slug: "merge-pdf", text: "Ready to combine the final versions? Merge the PDFs into one file." },
  related: ["pdf-to-text", "text-diff", "image-compare", "merge-pdf", "pdf-organizer"],
});
