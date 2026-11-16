import { Grid2x2 } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "pdf-n-up",
  name: "N-up PDF",
  tagline: "Put 2, 4, 6, 8, 9, 12 or 16 PDF pages on each sheet, with a live preview.",
  description:
    "Fit several pages of a PDF onto one sheet to save paper, make handouts or print slides. Choose how many pages go on a sheet, the paper size, the order, margins and borders, and see every sheet before you download. Pages stay sharp: text and drawings are placed, not turned into pictures. Everything runs in your browser, so the PDF is never uploaded.",
  primaryKeyword: "multiple pages per sheet pdf",
  seoTitle: "Multiple Pages Per Sheet PDF, Free N-up",
  seoDescription:
    "Put 2, 4, 6, 8, 9 or 16 PDF pages on each sheet to save paper, with a live preview, margins and borders. Runs in your browser; nothing is uploaded.",
  answer:
    "N-up PDF puts multiple pages per sheet: 2, 4, 6, 8, 9, 12 or 16 pages of a PDF on each new page, in the order and paper size you choose, with sharp text. It runs in your browser, so the PDF is never uploaded.",
  category: "pdf",
  keywords: ["n-up pdf", "multiple pages per sheet pdf", "pages per sheet", "2 pages per sheet pdf", "4 pages per sheet pdf", "print multiple pages on one page pdf", "combine pages onto one page pdf", "handouts pdf", "imposition"],
  icon: Grid2x2,
  howTo: [
    "Drop a PDF into the box.",
    "Choose how many pages go on each sheet, the paper size and the order, and check each sheet in the preview.",
    "Click Make N-up PDF and download the new file.",
  ],
  faq: [
    { question: "How do I put several PDF pages on one page?", answer: "Drop the PDF, choose 2, 4 or more pages per sheet and download the new file. Every sheet is shown first, so you can check the order and size." },
    { question: "Does the text stay sharp?", answer: "Yes. Each page is placed on the sheet as it is, with its text, fonts and drawings, not as a picture, so it prints sharply and the text can still be selected and searched." },
    { question: "What does Repeat each page do?", answer: "It fills every sheet with copies of one page, which is handy for printing business cards, labels or flyers several to a sheet." },
    { question: "Can I choose the page order?", answer: "Yes: left to right then down, top to bottom then across, or right to left for languages written that way." },
    { question: "Are links and form fields kept?", answer: "Filled-in form entries, stamps and comments are drawn into the pages so they show and print. Links and fillable fields do not carry over, because the pages become part of a larger sheet." },
    { question: "Is my PDF uploaded?", answer: "No. The sheets are made in your browser. The file never leaves your device." },
  ],
  nextStep: { slug: "pdf-booklet", text: "Printing a folded booklet instead? Use the PDF Booklet Maker." },
  related: ["pdf-booklet", "resize-pdf", "merge-pdf", "pdf-organizer", "crop-pdf"],
});
