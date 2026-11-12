import { Crop } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "crop-pdf",
  name: "Crop PDF",
  tagline: "Trim the margins off every page, or only some pages, of a PDF.",
  description:
    "Cut white borders or unwanted edges off a PDF. Enter the margins to remove in millimetres, inches or points, preview the result on a real page, or detect blank borders automatically. Processed in your browser; the file is never uploaded.",
  primaryKeyword: "crop pdf",
  seoTitle: "Crop PDF Online Free, No Upload",
  seoDescription:
    "Trim margins off a PDF, on all pages or only the ones you pick. Preview the crop, detect blank borders automatically and download the result. Nothing uploaded.",
  answer:
    "Crop PDF trims the margins you choose off every page, or only selected pages, and saves a new PDF with the smaller page area. It runs in your browser, so the file is never uploaded.",
  category: "pdf",
  keywords: ["crop pdf", "trim pdf", "remove pdf margins", "cut pdf borders", "resize pdf page", "crop pdf pages", "remove white space from pdf"],
  icon: Crop,
  howTo: [
    "Drop a PDF into the box.",
    "Enter the margin to remove from each side, or press Detect blank borders, and check the preview.",
    "Choose all pages or selected pages, then download the cropped PDF.",
  ],
  faq: [
    { question: "How do I crop a PDF?", answer: "Drop the PDF, enter how much to remove from the top, right, bottom and left, check the preview and download the new file." },
    { question: "Does cropping delete what I cut off?", answer: "No. The parts you trim are hidden, not erased, and they are still stored in the file. Do not rely on cropping to hide private information." },
    { question: "Can I crop only some pages?", answer: "Yes. Choose selected pages and type the page numbers, such as 1-3, 5." },
    { question: "Does it work on rotated pages?", answer: "Yes. Margins are measured on the page as you see it, so the top is always the top, even when the page is stored turned." },
  ],
  nextStep: { slug: "rotate-pdf", text: "Pages sideways after cropping? Rotate the PDF pages." },
  related: ["rotate-pdf", "pdf-organizer", "split-pdf", "extract-pdf-pages", "images-to-pdf"],
});
