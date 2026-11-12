import { PanelTop } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "pdf-header-footer",
  name: "Add Header and Footer to PDF",
  tagline: "Stamp headers, footers, page numbers and Bates numbers on a PDF.",
  description:
    "Put text in the header and footer of every page of a PDF: left, middle and right, with page numbers, a date, the file name and Bates numbers such as ACME-000123 filled in per page. Choose the pages, mirror for double-sided printing, and see a preview. Runs in your browser; nothing is uploaded.",
  primaryKeyword: "add header and footer to pdf",
  seoTitle: "Add Header and Footer to PDF, Bates Numbers",
  seoDescription:
    "Add a header, footer, page numbers or Bates numbers to a PDF, on the pages you choose, with a live preview. Runs in your browser; nothing is uploaded.",
  answer:
    "Add Header and Footer to PDF puts text at the left, middle and right of the top and bottom of each page, and fills in the page number, page count, date, file name or a Bates number such as ACME-000123 for every page. It runs in your browser; nothing is uploaded.",
  category: "pdf",
  keywords: ["add header and footer to pdf", "bates numbering pdf", "add bates numbers to pdf", "pdf header", "pdf footer", "add date to pdf", "bates stamp pdf", "add document id to pdf"],
  icon: PanelTop,
  howTo: [
    "Drop a PDF into the box.",
    "Type text in the header and footer boxes, or start from a layout. Use the buttons to insert the page number, date, file name or Bates number.",
    "Choose the pages, check the preview, then download the stamped PDF.",
  ],
  faq: [
    {
      question: "What is Bates numbering?",
      answer: "It is a running identifier stamped on every page of a set of documents, such as ACME-000123, so each page can be cited exactly. Choose the Bates layout, set the prefix, the first number and the number of digits, and each stamped page counts up by one.",
    },
    {
      question: "Can I leave the cover page out?",
      answer: "Yes. Turn on Leave the first page blank. Page numbers still count it, so page 2 reads 2. Bates numbers start at your first number on the first stamped page.",
    },
    {
      question: "Can I stamp only some pages?",
      answer: "Yes. Choose all, odd, even or a list such as 2-5, 8. The preview shows which pages are stamped.",
    },
    {
      question: "What does mirroring do?",
      answer: "On even pages the left and right texts swap places, so text meant for the outer edge stays on the outer edge when the pages are printed on both sides.",
    },
    {
      question: "Can I use letters like Ж or ł in the text?",
      answer: "Yes. English, European, Cyrillic, Greek and Vietnamese text all work. Chinese, Japanese, Korean, Arabic, Hebrew and Indic scripts do not, and the tool names the characters it cannot print.",
    },
    {
      question: "What if the texts do not fit?",
      answer: "The tool tells you which page and which row have texts that run into each other or off the page. Shorten them, use a smaller size or a smaller margin.",
    },
    {
      question: "Will a digital signature survive?",
      answer: "No. Any change to a signed PDF breaks its signature, and the tool warns you when it finds one.",
    },
  ],
  nextStep: { slug: "pdf-watermark", text: "Marking the document as a draft too? Add a watermark." },
  related: ["pdf-page-numbers", "pdf-watermark", "redact-pdf", "sign-pdf", "merge-pdf"],
});
