import { Grid3x3 } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "pdf417-generator",
  name: "PDF417 Generator",
  tagline: "Make a PDF417 2D barcode as an SVG, without uploading anything.",
  description:
    "Type the text or data you want to encode and download a PDF417 barcode as an SVG. The barcode is generated in your browser, so your data never leaves the device.",
  category: "generators",
  keywords: [
    "pdf417 generator",
    "pdf417 barcode",
    "2d barcode generator",
    "create pdf417",
    "pdf417 svg",
    "free pdf417 generator",
    "shipping barcode generator",
  ],
  icon: Grid3x3,
  howTo: [
    "Type or paste the text you want to encode.",
    "Click Generate to create the PDF417 barcode.",
    "Download the SVG file.",
  ],
  faq: [
    {
      question: "Is my data uploaded?",
      answer: "No. The barcode is drawn in your browser from the text you type. Nothing is sent anywhere.",
    },
    {
      question: "How much text fits in a PDF417?",
      answer: "PDF417 can hold up to about 1,850 ASCII characters, depending on the compaction mode used.",
    },
    {
      question: "Can I use this for shipping labels?",
      answer:
        "Yes, but real shipping identifiers should come from the carrier or your logistics system. The generator draws any valid-looking data.",
    },
  ],
  primaryKeyword: "pdf417 generator",
  seoTitle: "PDF417 Generator, Free SVG",
  seoDescription:
    "Create a PDF417 barcode from text and download it as an SVG. Free, no upload, no sign-up, and nothing leaves your browser.",
  answer:
    "PDF417 Generator turns text into a PDF417 2D barcode you can download as an SVG. Type the data, click Generate, and save the file. It runs in your browser, so your data is never uploaded.",
  nextStep: { slug: "barcode-generator", text: "Need a 1D barcode? Try the barcode generator." },
  related: ["barcode-generator", "data-matrix-generator", "qr-code-generator"],
});
