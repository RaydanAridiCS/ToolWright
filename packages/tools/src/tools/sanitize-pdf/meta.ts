import { ShieldMinus } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "sanitize-pdf",
  name: "Sanitize PDF",
  tagline: "Remove hidden scripts, attached files, metadata and hidden layers before you share a PDF.",
  description:
    "See what a PDF carries besides its pages, then remove it: JavaScript, actions that open programs or send data, attached files, metadata, location data in photos, content on hidden layers and earlier saved versions. Comments, form fields and web links can go too. The pages look the same, and the new file is checked afterwards. Runs in your browser, so nothing is uploaded.",
  primaryKeyword: "sanitize pdf",
  seoTitle: "Sanitize PDF: Remove Hidden Data, No Upload",
  seoDescription:
    "Remove JavaScript, attached files, metadata, photo location data, hidden layers and old versions from a PDF before sharing. Runs in your browser, no upload.",
  answer:
    "Sanitize PDF removes what a PDF carries besides its pages: scripts, risky actions, attached files, metadata, camera data in photos, hidden layers and earlier saved versions. It shows what it found first and runs in your browser, so the file is never uploaded.",
  category: "pdf",
  keywords: ["sanitize pdf", "remove hidden data from pdf", "remove javascript from pdf", "pdf sanitizer", "clean pdf before sharing", "remove embedded files from pdf", "remove hidden layers from pdf", "remove exif from pdf images", "safe pdf"],
  icon: ShieldMinus,
  howTo: [
    "Drop one or more PDFs. Toolwright lists the scripts, attachments, metadata, hidden layers and other data each one carries.",
    "Choose what to remove. Scripts, risky actions, attachments, metadata and hidden layers are chosen for you.",
    "Click Clean and download the PDF. The new file is read back to confirm what is gone.",
  ],
  faq: [
    { question: "What hidden data can a PDF contain?", answer: "Besides its pages, a PDF can carry scripts, actions that open programs or websites, attached files, the author's name and the software used, editing history from the application that made it, GPS location in photos, content on layers that are switched off, and earlier versions of the file saved on top of each other." },
    { question: "Will the pages look different?", answer: "No. Everything that shows on the page stays exactly where it is. Only content on hidden layers is taken out, and comments, form fields and web links only if you choose." },
    { question: "Does this remove text I can see, such as names or numbers?", answer: "No. Sanitizing removes what is hidden. To black out words that show on the page, use Redact PDF, which removes the text underneath as well." },
    { question: "What are earlier saved versions?", answer: "Some programs save changes by adding them to the end of the file, so older versions of pages, deleted text or removed images can still be inside. Toolwright writes the file again from scratch, so only the current version is kept." },
    { question: "Is it safe to open a suspicious PDF here?", answer: "Toolwright reads the file's structure without running any of its scripts or actions, so you can see what it contains and remove it. The file never leaves your device." },
    { question: "Does removing metadata affect PDF/A archive files?", answer: "Yes. PDF/A requires XMP metadata, so a sanitized file is no longer valid PDF/A. Leave Metadata switched off for archive copies." },
  ],
  nextStep: { slug: "redact-pdf", text: "Need to hide words on the page too? Redact the PDF." },
  related: ["redact-pdf", "pdf-metadata-editor", "flatten-pdf", "protect-pdf", "compress-pdf"],
});
