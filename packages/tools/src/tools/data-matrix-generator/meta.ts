import { QrCode } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "data-matrix-generator",
  name: "Data Matrix Generator",
  tagline: "Make a Data Matrix 2D barcode as an SVG, without uploading anything.",
  description:
    "Type the text or data you want to encode and download a Data Matrix barcode as an SVG. The barcode is generated in your browser, so your data never leaves the device.",
  category: "generators",
  keywords: [
    "data matrix generator",
    "data matrix barcode",
    "2d barcode generator",
    "create data matrix",
    "data matrix svg",
    "free data matrix generator",
    "ecc200 generator",
  ],
  icon: QrCode,
  howTo: [
    "Type or paste the text you want to encode.",
    "Click Generate to create the Data Matrix barcode.",
    "Download the SVG file.",
  ],
  faq: [
    {
      question: "Is my data uploaded?",
      answer: "No. The barcode is drawn in your browser from the text you type. Nothing is sent anywhere.",
    },
    {
      question: "How much text fits in a Data Matrix?",
      answer: "A standard ECC-200 Data Matrix can hold up to 3,116 alphanumeric characters, depending on the character mix.",
    },
    {
      question: "Can I use this for product labels?",
      answer:
        "Yes, but real GS1 or product identifiers should come from your organisation's numbering system. The generator draws any valid-looking data.",
    },
  ],
  primaryKeyword: "data matrix generator",
  seoTitle: "Data Matrix Generator, Free SVG",
  seoDescription:
    "Create a Data Matrix barcode from text and download it as an SVG. Free, no upload, no sign-up, and nothing leaves your browser.",
  answer:
    "Data Matrix Generator turns text into a Data Matrix 2D barcode you can download as an SVG. Type the data, click Generate, and save the file. It runs in your browser, so your data is never uploaded.",
  nextStep: { slug: "qr-code-generator", text: "Need a QR code instead? Generate one here." },
  related: ["qr-code-generator", "barcode-generator", "pdf417-generator"],
});
