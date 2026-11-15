import { FilePen } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "edit-pdf",
  name: "Edit PDF",
  tagline: "Add text, pictures, shapes, highlights, whiteout and drawings to a PDF, and change its existing text.",
  description:
    "A PDF editor that runs in your browser. Type new text anywhere, change a line of the PDF's own text, add pictures, logos and signatures, highlight, white out, draw freehand, and add rectangles, ellipses, lines, arrows and check marks. Move and resize everything on a live page preview, with undo, and save a PDF that looks the same in every reader. Your file never leaves your device.",
  primaryKeyword: "edit pdf",
  seoTitle: "Edit PDF Online Free: Add and Change Text",
  seoDescription:
    "Edit a PDF in your browser: add or change text, pictures, signatures, highlights, whiteout, shapes and drawings. Free, no sign-up, and nothing is uploaded.",
  answer:
    "Edit PDF lets you change a PDF in your browser: add text anywhere, replace a line of existing text, add pictures and signatures, highlight, white out, draw and add shapes, arrows and check marks. You place everything on a live page preview with undo, and the PDF is edited on your device, so it is never uploaded.",
  category: "pdf",
  keywords: [
    "edit pdf",
    "pdf editor",
    "edit pdf online free",
    "add text to pdf",
    "edit text in pdf",
    "write on pdf",
    "whiteout pdf",
    "highlight pdf",
    "draw on pdf",
    "add image to pdf",
    "annotate pdf",
    "pdf editor no upload",
  ],
  icon: FilePen,
  popular: true,
  howTo: [
    "Drop your PDF. Each page appears as a preview you can work on.",
    "Pick a tool: Add text, Edit existing text, Draw, Highlight, Whiteout, a shape, a mark, a picture or a signature. Click or drag on the page to use it.",
    "Select anything you added to move it, resize it or change its colour, font and size. Undo with Ctrl+Z.",
    "Save the PDF and download it.",
  ],
  faq: [
    {
      question: "Is my PDF uploaded?",
      answer: "No. The pages are drawn and edited in your browser tab, and the new PDF is made on your device. Nothing is sent anywhere, so you can edit contracts, forms and statements.",
    },
    {
      question: "Can I change the text that is already in the PDF?",
      answer:
        "Yes, line by line. Choose Edit existing text and click a line: its words are covered with a box in the page colour and appear in a text box you can change, in the nearest standard font (Helvetica, Times or Courier) at the same size and colour. The old words are still in the file under the cover, so search and copy can find them. To remove words for good, use Redact PDF.",
    },
    {
      question: "Does whiteout remove the text underneath?",
      answer:
        "No. Whiteout paints a box over the page, which hides what is under it when the file is viewed or printed, but the original text and pictures are still in the file. For anything confidential, use Redact PDF, which removes the covered content.",
    },
    {
      question: "Will my edits show up in every PDF reader?",
      answer:
        "Yes. Edits are drawn into the pages themselves, not added as comments that some viewers hide or that can be deleted with one click. The result looks the same in Acrobat, browsers, phones and on paper.",
    },
    {
      question: "Which fonts can I use?",
      answer:
        "Helvetica, Times and Courier, each in regular, bold, italic and bold italic. These are the standard PDF fonts every reader has, so the file stays small. Text in Polish, Czech, Turkish, Vietnamese, Greek, Russian and other Latin, Greek and Cyrillic languages is printed in Noto Sans. Arabic, Hebrew, Chinese, Japanese and Korean are not supported yet.",
    },
    {
      question: "Can I add my signature?",
      answer:
        "Yes. Choose Add a signature to draw, type or upload it, then drag it into place. It is a picture of your signature, like signing a printout, not a certified digital signature. Sign PDF can also put it on every page with a date.",
    },
    {
      question: "Can I fill in a form?",
      answer: "You can type on any form with Add text and tick boxes with the check mark. If the PDF has real form fields, Fill PDF Form fills them properly so they stay editable.",
    },
    {
      question: "Does it work on rotated or scanned pages?",
      answer:
        "Yes. Edits go where you put them on the page as you see it, even on pages stored turned sideways, and text stays upright. On scans there is no text to edit, so cover words with Whiteout and type new ones with Add text.",
    },
  ],
  nextStep: { slug: "compress-pdf", text: "Added large pictures? Make the edited PDF smaller." },
  related: ["sign-pdf", "redact-pdf", "fill-pdf-form", "pdf-watermark", "pdf-organizer"],
});
