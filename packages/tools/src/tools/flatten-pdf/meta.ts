import { Layers2 } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "flatten-pdf",
  name: "Flatten PDF",
  tagline: "Make form entries, comments, highlights and stamps a permanent part of the page.",
  description:
    "Flatten a PDF so it looks the same in every reader and cannot be changed: filled-in form fields, ticks, comments, highlights, stamps and drawings are drawn into the pages exactly where they show, and the fillable form and comment layer are removed. See what the file holds first, choose what to flatten, keep or remove links, and flatten many PDFs at once. Everything runs in your browser, so nothing is uploaded.",
  primaryKeyword: "flatten pdf",
  seoTitle: "Flatten PDF Forms and Comments, No Upload",
  seoDescription:
    "Flatten a PDF: lock filled-in forms, comments, highlights and stamps into the page so it looks the same everywhere. Many files at once. Nothing is uploaded.",
  answer:
    "Flatten PDF draws a PDF's filled-in form fields, comments, highlights and stamps into the pages and removes the editable layer, so the file looks the same in every reader and cannot be changed. It runs in your browser, so nothing is uploaded.",
  category: "pdf",
  keywords: ["flatten pdf", "flatten pdf online", "flatten pdf annotations", "flatten pdf comments", "make pdf uneditable", "lock pdf form fields", "flatten fillable pdf", "remove form fields from pdf", "pdf flattener"],
  icon: Layers2,
  howTo: [
    "Drop one or more PDFs. Toolwright shows the form fields, comments and links each one has.",
    "Choose what to flatten: form fields, comments and marks, and whether to remove links.",
    "Click Flatten and download the PDF (or a ZIP for several files).",
  ],
  faq: [
    { question: "What does flattening a PDF do?", answer: "It turns interactive parts, such as form fields and comments, into ordinary page content. The PDF looks exactly the same, but the entries can no longer be changed, and every reader and printer shows them the same way." },
    { question: "Why would I flatten a filled-in form?", answer: "So the answers stay as they are when you send it, print it or upload it to a portal. Some readers and printers leave form entries out or show them differently; a flattened form looks the same everywhere." },
    { question: "Does flattening hide or remove private information?", answer: "No. Flattening keeps everything you can see. To black out private details for good, use Redact PDF, which removes the text underneath." },
    { question: "What happens to sticky notes?", answer: "The note icon is drawn where it was, but the text that pops up when you click it is not printed on the page. A note with no picture of its own is removed, and the result says how many." },
    { question: "What about a digitally signed PDF?", answer: "You get a warning first. Flattening changes the file, so the digital signature can no longer be checked, although its picture stays on the page." },
    { question: "Is my PDF uploaded?", answer: "No. The PDF is flattened in your browser and never leaves your device. The old field values are removed from the file, not just hidden." },
  ],
  nextStep: { slug: "compress-pdf", text: "Want a smaller file to send? Compress the PDF." },
  related: ["fill-pdf-form", "redact-pdf", "edit-pdf", "sign-pdf", "protect-pdf", "compress-pdf"],
});
