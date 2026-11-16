import { FilePlus2 } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "insert-pdf-pages",
  name: "Insert PDF Pages",
  tagline: "Add blank pages, or pages from another PDF, anywhere in a PDF.",
  description:
    "Insert blank pages or pages from another PDF exactly where you want them: click between page previews, or add them after every page or every few pages, such as a blank page for notes after each slide. Blank pages can match the page next to them or be A4, Letter or another size. Bookmarks, links and fillable forms are kept. Everything runs in your browser, so nothing is uploaded.",
  primaryKeyword: "insert pages into pdf",
  seoTitle: "Insert Pages into PDF: Blank or From a PDF",
  seoDescription:
    "Add blank pages or pages from another PDF anywhere in a PDF: click between previews or insert after every page. Free, no sign-up, and nothing is uploaded.",
  answer:
    "Insert PDF Pages lets you insert pages into a PDF: blank pages or pages from another PDF, at the spots you click between page previews or after every few pages. Bookmarks and forms are kept, and it runs in your browser, so nothing is uploaded.",
  category: "pdf",
  keywords: ["insert pages into pdf", "add blank page to pdf", "insert blank page in pdf", "add pages to pdf", "insert pdf into pdf", "add a page to a pdf", "add notes pages to pdf", "insert page in pdf"],
  icon: FilePlus2,
  howTo: [
    "Drop the PDF you want to add pages to.",
    "Choose blank pages, or drop another PDF and choose which of its pages to insert.",
    "Click the plus between two pages to insert there (or choose after every N pages), then download the new PDF.",
  ],
  faq: [
    { question: "How do I add a blank page to a PDF?", answer: "Drop the PDF, keep Blank pages chosen, click the plus where the page should go, and download. The blank page has the same size as the page next to it unless you choose another size." },
    { question: "Can I put a page from another PDF in the middle of mine?", answer: "Yes. Choose Pages from another PDF, drop that file, type the pages you want (or leave it empty for all), and click the plus between the two pages where they should go." },
    { question: "Can I add a blank page after every page?", answer: "Yes. Choose After every N pages and keep it at 1. That gives each page a blank page after it, which is handy for notes or for printing one-sided pages double-sided." },
    { question: "Are bookmarks and forms kept?", answer: "Yes. The PDF's bookmarks still point to the right pages, links keep working, and form fields stay fillable. A page with form fields inserted more than once gets its own copy of the fields each time." },
    { question: "Does inserting the same page many times make the file much bigger?", answer: "No. A page repeated many times is stored once and shown at each spot, so the file grows only a little." },
    { question: "Is my PDF uploaded?", answer: "No. Pages are inserted in your browser and the files never leave your device." },
  ],
  nextStep: { slug: "pdf-organizer", text: "Want to move pages around too? Organize the pages." },
  related: ["merge-pdf", "pdf-organizer", "alternate-mix-pdf", "delete-pdf-pages", "extract-pdf-pages", "split-pdf"],
});
