import { EyeOff } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "redact-pdf",
  name: "Redact PDF",
  tagline: "Black out names, numbers and emails so the text is removed, not just hidden.",
  description:
    "Cover areas of a PDF with solid black boxes, drawn by hand or found by searching for words, email addresses and phone or account numbers. Pages with a box are rebuilt as pictures, so the covered text is gone from the file. Runs in your browser; nothing is uploaded.",
  primaryKeyword: "redact pdf",
  seoTitle: "Redact PDF Free, Removes Text, No Upload",
  seoDescription:
    "Black out names, numbers and emails in a PDF. Marked pages are rebuilt as pictures, so the text is removed, not hidden. Runs in your browser.",
  answer:
    "Redact PDF covers the areas you draw, or every match of words, emails or numbers you search for, then rebuilds those pages as pictures so the covered text is removed from the file, not just hidden. It runs in your browser; nothing is uploaded.",
  category: "pdf",
  keywords: ["redact pdf", "black out pdf", "redact pdf online", "remove text from pdf", "hide sensitive information in pdf", "censor pdf", "redact personal information pdf", "permanently redact pdf"],
  icon: EyeOff,
  howTo: [
    "Drop a PDF into the box.",
    "Drag across the page to cover an area, or search for words, email addresses or numbers and let the tool mark every match.",
    "Check each box, choose the picture quality, then download the redacted PDF and look through it before you share it.",
  ],
  faq: [
    {
      question: "Is a black box over the text enough?",
      answer: "No. A box drawn on top of live text leaves the words in the file, where anyone can select, search or copy them. This tool redraws each page that has a box as a picture with the black painted in, so the covered text, and the fonts and commands that held it, are not in the result.",
    },
    {
      question: "What changes in the pages I redact?",
      answer: "They become pictures. The text on them can no longer be selected or searched, and links and notes on them are gone. Pages without a box are copied as they were, with their text, unless you turn on every page.",
    },
    {
      question: "Does it remove the author, title and bookmarks?",
      answer: "Yes. The result is a new file that carries none of the original document properties, bookmarks, form fields or attachments. It only says that Toolwright made it.",
    },
    {
      question: "Can it find the text for me?",
      answer: "Yes, if the PDF has a text layer. Search for words, email addresses or long numbers and it marks each match. The position inside a line is an estimate, so check every box. A scanned page has no text to search, so draw boxes there by hand.",
    },
    {
      question: "Is anything uploaded?",
      answer: "No. The pages are drawn, painted and saved in your browser tab, and the file never leaves your device.",
    },
    {
      question: "Will a digital signature survive?",
      answer: "No. Any change to a signed PDF breaks its signature, and the tool warns you when it finds one.",
    },
  ],
  nextStep: { slug: "pdf-metadata-editor", text: "Redacted? Check the file for leftover properties next." },
  related: ["pdf-metadata-editor", "sign-pdf", "compress-pdf", "pdf-watermark", "crop-pdf"],
});
