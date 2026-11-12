import { FileMinus } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "remove-blank-pages",
  name: "Remove Blank Pages",
  tagline: "Find and delete the empty pages in a scanned or exported PDF.",
  description:
    "Scan a PDF for blank pages, such as the empty backs of double-sided scans, check what was found on page previews, and remove them in one click. A blank page is judged by how it looks, so scans with specks and off-white paper work too. Runs in your browser; the file is never uploaded.",
  primaryKeyword: "remove blank pages from pdf",
  seoTitle: "Remove Blank Pages from PDF, No Upload",
  seoDescription:
    "Detect and delete the blank pages in a PDF, including empty scanned backs. Check the previews, adjust the sensitivity and download the clean file. No upload.",
  answer:
    "Remove Blank Pages from a PDF by checking every page, marking the empty ones and deleting them when you confirm. It runs in your browser, so the file is never uploaded.",
  category: "pdf",
  keywords: ["remove blank pages from pdf", "delete blank pages pdf", "blank page remover", "remove empty pages pdf", "skip blank pages scan", "remove blank pages from scanned pdf"],
  icon: FileMinus,
  howTo: [
    "Drop a PDF into the box and wait while the pages are checked.",
    "Look at the pages marked as blank. Change the sensitivity, or click a page to mark or unmark it.",
    "Press Remove, then download the cleaned PDF.",
  ],
  faq: [
    { question: "How does it decide a page is blank?", answer: "It draws each page and measures how much of it is clearly darker than the paper. Pages with almost nothing on them count as blank, and the edges are ignored because scanners leave shadows there." },
    { question: "A page with only a page number was marked blank. Why?", answer: "Normal sensitivity treats a page holding just a page number as blank, and Loose also ignores a footer line or small stamp. Choose Strict to remove only completely empty pages, or click a page to keep it." },
    { question: "Does it work on scanned PDFs?", answer: "Yes. Because it looks at how the page is drawn, an off-white scan with a few specks of dust still counts as blank, and a page with real content does not." },
    { question: "Is the original file changed?", answer: "No. You get a new PDF and your original stays as it was." },
  ],
  nextStep: { slug: "pdf-organizer", text: "Want to reorder or rotate the remaining pages? Use the PDF Page Organizer." },
  related: ["delete-pdf-pages", "pdf-organizer", "extract-pdf-pages", "split-pdf", "compress-pdf"],
});
