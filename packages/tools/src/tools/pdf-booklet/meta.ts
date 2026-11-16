import { BookCopy } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "pdf-booklet",
  name: "PDF Booklet Maker",
  tagline: "Rearrange a PDF so it prints as a folded, stapled booklet.",
  description:
    "Turn any PDF into a booklet you can print at home: pages are put two to a side in the right order, so you print double-sided, fold the stack in half and staple it. Blank pages are added where needed, long documents can be split into sections, and right-to-left binding is supported. Preview both sides of every sheet first. Everything runs in your browser, so the PDF is never uploaded.",
  primaryKeyword: "pdf booklet maker",
  seoTitle: "PDF Booklet Maker: Print Booklets, No Upload",
  seoDescription:
    "Make a printable booklet from any PDF: pages in folding order, blank pages added, sections for thick booklets, and a preview of each sheet. Nothing uploaded.",
  answer:
    "PDF Booklet Maker reorders a PDF's pages two to a side so the printout folds into a booklet: print double-sided, flip on the short edge, fold and staple. It adds any blank pages needed and runs in your browser, so the PDF is never uploaded.",
  category: "pdf",
  keywords: ["pdf booklet", "booklet pdf", "make a booklet from pdf", "print pdf as booklet", "booklet printing", "saddle stitch imposition", "zine maker", "pdf to booklet"],
  icon: BookCopy,
  howTo: [
    "Drop a PDF into the box.",
    "Choose the paper, the binding side and where blank pages go, and check the front and back of each sheet in the preview.",
    "Download the booklet, print it double-sided flipping on the short edge, fold the sheets in half and staple along the fold.",
  ],
  faq: [
    { question: "How do I print a PDF as a booklet?", answer: "Make the booklet file here, then print it on both sides of the paper with “flip on short edge” (sometimes called short-edge binding). Fold the stack in half and staple along the fold." },
    { question: "Why were blank pages added?", answer: "Each sheet of paper holds four pages, two on each side, so a booklet needs a multiple of four pages. Blank pages go at the end, or before the back cover if you want the last page to stay on the back." },
    { question: "What are sections?", answer: "A thick booklet folds badly as one stack. With sections, every 16 or so pages are folded separately and the sections are stacked and bound together, the way books are made." },
    { question: "Can I make a booklet that opens from the right?", answer: "Yes. Choose right binding for Arabic, Hebrew, Persian or Japanese layouts, and the pages are arranged to open from the right." },
    { question: "What paper size should I choose?", answer: "Pick the paper you print on, such as A4 or US Letter: each page is shrunk to half the sheet, so an A4 booklet comes out A5. Two pages side by side keeps the pages full size on a larger sheet." },
    { question: "Is my PDF uploaded?", answer: "No. The booklet is made in your browser. The file never leaves your device." },
  ],
  nextStep: { slug: "pdf-n-up", text: "Want several pages on one sheet without folding? Use N-up PDF." },
  related: ["pdf-n-up", "resize-pdf", "pdf-organizer", "merge-pdf", "pdf-page-numbers"],
});
