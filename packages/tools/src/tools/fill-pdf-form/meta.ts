import { FormInput } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "fill-pdf-form",
  name: "Fill PDF Form",
  tagline: "Fill in a PDF form, flatten it, or type onto a form that has no fields.",
  description:
    "Fill the text boxes, checkboxes, radio buttons and dropdowns of a fillable PDF, then keep it editable or flatten it so the entries are permanent. For flat forms with no fields, click the page and type text exactly where it belongs. Runs in your browser; the file is never uploaded.",
  primaryKeyword: "fill pdf form",
  seoTitle: "Fill PDF Form Online Free, No Upload",
  seoDescription:
    "Fill out a PDF form online: text fields, checkboxes and dropdowns, or type onto a flat form. Flatten it when you are done. Free, with no upload or sign-up.",
  answer:
    "Fill PDF Form fills the fields of a fillable PDF, flattens them when you want the entries locked in, and lets you type text onto a flat form that has no fields. It runs in your browser, so the file is never uploaded.",
  category: "pdf",
  keywords: ["fill pdf form", "fill out pdf", "pdf form filler", "type on pdf", "flatten pdf form", "fill in pdf online", "fill non-fillable pdf", "add text to pdf"],
  icon: FormInput,
  howTo: [
    "Drop a PDF into the box. If it has form fields they are listed; if not, you can type onto the page.",
    "Fill in the fields, or click the page where each piece of text should go.",
    "Choose whether to flatten the form, then download the filled PDF.",
  ],
  faq: [
    { question: "How do I fill out a PDF form?", answer: "Drop the PDF. A form with fields lists them for you to fill in; a flat form lets you click the page and type where the text belongs. Then download the result." },
    { question: "What does flatten do?", answer: "It turns the fields into ordinary page content, so the entries are permanent and cannot be edited, and the form looks the same in every viewer." },
    { question: "What if the PDF has no form fields?", answer: "Use Type on the page: click where text should go, type it, and set the size. English and European text is supported, including accents, Polish, Vietnamese, Russian and Greek letters." },
    { question: "Can I fill in Chinese, Arabic or other scripts?", answer: "Not yet. Text typed onto the page covers Latin, Cyrillic and Greek letters. Chinese, Japanese, Korean, Arabic, Hebrew and Indic scripts need fonts and letter shaping this tool does not include, and it names any character it cannot print. Values inside form fields use the PDF's own standard font, so for Cyrillic or Greek in a fillable form, use Type on the page." },
    { question: "Will this keep a digital signature valid?", answer: "No. Any change to a signed PDF breaks its signature, and the tool warns you when it finds one. To add your own signature picture, use Sign PDF." },
  ],
  nextStep: { slug: "sign-pdf", text: "Form filled? Add your signature to the PDF next." },
  related: ["sign-pdf", "pdf-watermark", "compress-pdf", "pdf-metadata-editor", "pdf-page-numbers"],
});
