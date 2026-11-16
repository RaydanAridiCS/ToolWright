import { Scissors } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "split-pdf",
  name: "Split PDF",
  tagline: "Split a PDF where you click, at its bookmarks, by file size, or into pages or ranges.",
  description:
    "Break a PDF into separate files. Click between page previews to split exactly where you want, or split at every bookmark (each file named after its chapter), into files under a size limit for email, into odd and even pages, one per page, every N pages, or by page ranges. Each part keeps its bookmarks. Download the pieces one by one or as a ZIP. Processed locally, so nothing is uploaded.",
  primaryKeyword: "split pdf",
  seoTitle: "Split PDF Online Free, No Upload",
  seoDescription:
    "Split a PDF into single pages, fixed chunks or custom ranges. Download the parts one by one or as a ZIP. Free, and nothing is uploaded.",
  answer:
    "Split PDF breaks a PDF into separate files: where you click between page previews, at each bookmark, under a file size, into odd and even pages, one per page, every N pages or page ranges such as 1-3; 4-6. It runs in your browser, so nothing is uploaded.",
  category: "pdf",
  keywords: ["split pdf", "separate pdf pages", "divide pdf", "pdf splitter", "extract pages", "break up pdf"],
  icon: Scissors,
  popular: true,
  howTo: [
    "Drop a PDF into the box. Every page appears as a preview.",
    "Click the scissors between two pages to start a new file there, or choose another way: every page, every N pages, page ranges, at bookmarks, by file size, or odd and even pages.",
    "Check which file each page goes into, then download the files or the whole set as a ZIP.",
  ],
  faq: [
    { question: "How do I split a PDF into separate pages?", answer: "Drop the PDF, choose every page and download the files, or the whole set as a ZIP." },
    { question: "How do I split a PDF by page ranges?", answer: "Choose ranges and separate the files with semicolons, for example 1-3; 4; 5-10." },
    { question: "Can I split a PDF into chapters?", answer: "Yes, if it has bookmarks. Choose At bookmarks: a new file starts at each chapter bookmark (or each chapter and section), and each file is named after its bookmark." },
    { question: "How do I split a PDF to fit an email attachment limit?", answer: "Choose By file size and enter the limit, such as 10 MB. Each file gets as many pages as fit. A single page larger than the limit gets a file of its own, and you are told about it." },
    { question: "Can I separate odd and even pages?", answer: "Yes. Choose Odd and even to get two files, which helps when printing double-sided by hand or fixing a one-sided scan." },
    { question: "Is my PDF uploaded?", answer: "No. The PDF is split in your browser." },
  ],
  nextStep: { slug: "merge-pdf", text: "Need to put pieces back together? Merge the PDFs." },
  related: ["extract-pdf-pages", "merge-pdf", "delete-pdf-pages", "rotate-pdf", "compress-pdf"],
});
