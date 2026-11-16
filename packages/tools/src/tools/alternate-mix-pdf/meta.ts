import { Shuffle } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "alternate-mix-pdf",
  name: "Alternate & Mix PDF",
  tagline: "Interleave the pages of two or more PDFs, such as the fronts and backs of a one-sided scan.",
  description:
    "Mix PDFs page by page: one page from the first file, one from the second, and so on. Scanned the fronts of a stack and then the backs on a one-sided scanner? Add both files (or one file with the fronts first) and the pages come back in reading order, with the backs reversed if you turned the stack over. Choose pages per file and how many to take at a time, and see the order before you download. Nothing is uploaded.",
  primaryKeyword: "interleave pdf pages",
  seoTitle: "Interleave PDF Pages: Alternate & Mix Scans",
  seoDescription:
    "Mix two PDFs page by page, such as fronts and backs from a one-sided scanner, with the backs reversed. Preview the order first. Free, and nothing is uploaded.",
  answer:
    "Alternate & Mix PDF lets you interleave PDF pages from two or more files, one page from each in turn, so the fronts and backs of a one-sided scan come back in reading order. It can reverse the backs, and it runs in your browser with no upload.",
  category: "pdf",
  keywords: ["interleave pdf pages", "alternate and mix pdf", "merge front and back scans", "combine odd and even pages pdf", "interleave two pdfs", "collate scanned pages", "mix pdf pages", "one-sided scanner double-sided"],
  icon: Shuffle,
  howTo: [
    "Add the PDF with the fronts, then the PDF with the backs. Or choose One file if both halves are in a single PDF.",
    "Check that the backs are reversed if you turned the stack over to scan them, and look over the page order.",
    "Click Mix pages and download the PDF in reading order.",
  ],
  faq: [
    {
      question: "How do I combine front and back scans into one PDF?",
      answer:
        "Scan the fronts, turn the stack over and scan the backs, then add the fronts file and the backs file here. The backs are reversed by default, because turning the stack over puts the last back first. Download, and the pages read 1, 2, 3 and so on.",
    },
    { question: "What if all the pages are in one file?", answer: "Choose One file: fronts, then backs. The first half of the pages are taken as the fronts and the second half as the backs, and they are mixed the same way." },
    { question: "The files have different page counts. What happens?", answer: "You get a warning so you can check that no page was missed. Pages are still taken in turn, and the rest of the longer file goes at the end." },
    { question: "Can I take more than one page at a time?", answer: "Yes. Set At a time for each file, for example 2 pages from A then 1 from B. You can also mix three or more files, and type which pages to take from each." },
    { question: "Is my PDF uploaded?", answer: "No. The pages are mixed in your browser and the files never leave your device." },
  ],
  nextStep: { slug: "remove-blank-pages", text: "Scanned some empty backs? Remove the blank pages." },
  related: ["merge-pdf", "pdf-organizer", "insert-pdf-pages", "remove-blank-pages", "split-pdf"],
});
