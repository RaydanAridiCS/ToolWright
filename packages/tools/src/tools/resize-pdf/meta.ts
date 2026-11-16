import { Proportions } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "resize-pdf",
  name: "Resize PDF Pages",
  tagline: "Change the page size of a PDF, such as Letter to A4, without cutting anything off.",
  description:
    "Change the paper size of every page, or only some pages, of a PDF: A4, US Letter, Legal, A3, A5, Tabloid or a size of your own. Fit the content inside the new page, fill the page, or keep it at its size and centre it, with a margin if you want one. Links, form fields and comments move with the content, and you see the result before you download. Everything runs in your browser, so the PDF is never uploaded.",
  primaryKeyword: "resize pdf pages",
  seoTitle: "Resize PDF Pages to A4 or Letter, No Upload",
  seoDescription:
    "Change PDF page size to A4, Letter, Legal, A3 or your own size. Fit, fill or centre the content, add a margin and preview it. Runs in your browser, no upload.",
  answer:
    "Resize PDF Pages changes the page size of a PDF, for example US Letter to A4, and scales the content to fit, fill or stay centred on the new page, with links and forms kept. It runs in your browser, so the PDF is never uploaded.",
  category: "pdf",
  keywords: ["resize pdf pages", "change pdf page size", "letter to a4 pdf", "a4 to letter pdf", "scale pdf to a4", "pdf page size", "convert pdf to a4", "resize pdf to letter", "add margins to pdf"],
  icon: Proportions,
  howTo: [
    "Drop a PDF into the box.",
    "Choose the new page size and orientation, and whether the content should fit, fill or keep its size. Check the preview.",
    "Choose all pages or only some, then download the resized PDF.",
  ],
  faq: [
    { question: "How do I change a PDF from Letter to A4?", answer: "Drop the PDF, choose A4 and Fit, and download. Each page becomes A4 and its content is scaled slightly to fit, with nothing cut off." },
    { question: "What is the difference between fit and fill?", answer: "Fit shows the whole page inside the new size, which may leave a white band at two edges. Fill covers the new page completely, which may trim a little off two edges. Keep size centres the content without scaling it." },
    { question: "Does resizing lower the quality or make the file bigger?", answer: "No. The content is scaled, not redrawn as a picture, so text stays sharp and selectable and the file stays about the same size." },
    { question: "Do links and form fields still work?", answer: "Yes. Links, form fields and comments are moved and scaled along with the content, so they stay in the right place." },
    { question: "Can I add a margin to every page?", answer: "Yes. Choose Fit and enter a margin: the content shrinks to leave that much white space all the way round, which helps when a printer cuts off the edges." },
    { question: "Is my PDF uploaded?", answer: "No. The pages are resized in your browser. The file never leaves your device." },
  ],
  nextStep: { slug: "crop-pdf", text: "Want to trim the margins off instead? Crop the PDF." },
  related: ["crop-pdf", "pdf-n-up", "pdf-booklet", "rotate-pdf", "compress-pdf"],
});
