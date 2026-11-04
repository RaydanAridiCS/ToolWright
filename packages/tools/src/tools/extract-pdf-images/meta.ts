import { Image } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "extract-pdf-images",
  name: "Extract PDF Images",
  tagline: "Pull the original embedded pictures out of a PDF as JPG or PNG files.",
  description:
    "Extract the original embedded image assets from a PDF — JPEGs stay as JPEGs, and lossless images are returned as PNGs. Download them one by one or all together in a ZIP. Everything is read in your browser; the PDF never leaves your device.",
  primaryKeyword: "extract images from pdf",
  seoTitle: "Extract Images from PDF Online Free",
  seoDescription:
    "Pull the original embedded pictures out of a PDF as JPG or PNG files. Download one by one or as a ZIP. Nothing is uploaded.",
  answer:
    "Extract PDF Images pulls the original embedded pictures from a PDF and saves them as JPG or PNG files. JPEGs are returned unchanged, lossless images are rebuilt as PNGs, and everything happens in your browser — the PDF is never uploaded.",
  category: "pdf",
  keywords: [
    "extract images from pdf",
    "pdf image extractor",
    "save images from pdf",
    "extract pictures from pdf",
    "pdf to images original",
    "get images out of pdf",
    "pdf embedded images",
    "export images from pdf",
  ],
  icon: Image,
  howTo: [
    "Drop a PDF into the box. It stays on your device.",
    "Click Extract images to scan the PDF for embedded pictures.",
    "Download individual images or all of them as one ZIP file.",
  ],
  faq: [
    {
      question: "Is my PDF uploaded?",
      answer:
        "No. The PDF is read entirely in your browser with pdf-lib. No image or page is sent to a server.",
    },
    {
      question: "What image formats can be extracted?",
      answer:
        "JPEGs are saved as they are stored in the PDF. Lossless images are reconstructed as PNGs. JPEG 2000, CCITT fax and JBIG2 images are skipped with a note, because they would need a separate decoder.",
    },
    {
      question: "Will the extracted images look exactly like the PDF pages?",
      answer:
        "No. This tool extracts the embedded image assets, not rendered snapshots of the pages. Text, vector drawings and page backgrounds are not included.",
    },
    {
      question: "What if the same picture appears on many pages?",
      answer:
        "Images are deduplicated by their internal object reference, so a picture used on ten pages only appears once in the download list.",
    },
  ],
  nextStep: { slug: "pdf-to-images", text: "Need pictures of whole pages instead? Convert PDF pages to images." },
  related: ["pdf-to-images", "pdf-organizer", "compress-pdf", "image-converter"],
});
