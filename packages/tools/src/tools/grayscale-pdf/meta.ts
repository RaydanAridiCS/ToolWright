import { Contrast } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "grayscale-pdf",
  name: "Grayscale PDF",
  tagline: "Turn a colour PDF into shades of gray, or pure black and white, with text kept sharp.",
  description:
    "Convert a colour PDF to grayscale for printing, or to pure black and white. Text and drawings stay sharp, selectable vectors: their colours are rewritten, not turned into a picture. Photos, colour blends, spot colours, form fields and comments become gray too, and you see the page before and after. Convert many PDFs at once. Everything runs in your browser, so nothing is uploaded.",
  primaryKeyword: "convert pdf to grayscale",
  seoTitle: "Convert PDF to Grayscale or Black and White",
  seoDescription:
    "Turn a colour PDF into grayscale or pure black and white with text kept sharp and selectable. Photos and colour blends too. Free, and nothing is uploaded.",
  answer:
    "Grayscale PDF lets you convert a PDF to grayscale or to pure black and white in your browser. Text and drawings stay sharp because their colours are rewritten, and photos and colour blends turn gray too. Nothing is uploaded.",
  category: "pdf",
  keywords: ["convert pdf to grayscale", "grayscale pdf", "pdf to black and white", "make pdf black and white", "remove color from pdf", "pdf greyscale", "print pdf in grayscale", "colour pdf to gray"],
  icon: Contrast,
  howTo: [
    "Drop one or more colour PDFs.",
    "Choose shades of gray, or black and white with a lightness threshold.",
    "Click Convert, compare the page before and after, and download.",
  ],
  faq: [
    { question: "Does the text stay sharp and selectable?", answer: "Yes. Toolwright changes the colour settings inside the PDF instead of turning pages into pictures, so text stays text, drawings stay crisp, and the file usually stays about the same size." },
    { question: "How are colours turned into gray?", answer: "Each colour becomes the gray of the same lightness, using the weights the PDF standard gives for red, green and blue. Spot colours such as Pantone inks are converted through their own colour formulas, so they keep the right shade." },
    { question: "What is the difference between grayscale and black and white?", answer: "Grayscale keeps every shade from black to white. Black and white keeps only the two, which suits faxes and makes scans very small. Choose where light turns to white with the threshold; pale colours such as yellow highlights may disappear." },
    { question: "Will a print shop see the file as grayscale?", answer: "Text, drawings and most pictures are stored in gray. Photos stored as JPEG are saved again with only gray in them, but in a colour JPEG, because browsers cannot write gray JPEGs, so a strict preflight check may still list them as RGB." },
    { question: "Is anything left in colour?", answer: "Rarely. JPEG 2000 pictures and some advanced mesh colour blends cannot be redrawn in the browser, so they keep their colour, and the result tells you how many there are." },
    { question: "Is my PDF uploaded?", answer: "No. The PDF is converted in your browser, photos included, and never leaves your device." },
  ],
  nextStep: { slug: "compress-pdf", text: "Want a smaller file too? Compress the PDF." },
  related: ["compress-pdf", "pdf-n-up", "pdf-booklet", "flatten-pdf", "pdf-to-images"],
});
