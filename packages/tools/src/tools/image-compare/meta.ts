import { SplitSquareHorizontal } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "image-compare",
  name: "Compare Two Images",
  tagline: "Put two pictures side by side, over each other, or on a difference map.",
  description:
    "Open two pictures and slide one over the other, view them side by side, or see a difference map that marks changed pixels. Sizes, formats and pixel differences are measured in your browser, so nothing is uploaded.",
  primaryKeyword: "compare two images",
  seoTitle: "Compare Two Images Online, Free, No Upload",
  seoDescription:
    "Compare two images with a sliding overlay, side by side, or on a difference map that marks changed pixels. Nothing is uploaded; the check runs in your browser.",
  answer:
    "Compare Two Images puts two pictures next to each other, overlays them on a sliding divider, or draws a difference map where changed pixels show red. Where the dimensions match, it also reports how many pixels differ. It runs in your browser, so neither picture is uploaded.",
  category: "image",
  keywords: ["compare two images", "image comparison online", "compare images side by side", "image diff", "photo comparison tool", "difference between two images"],
  icon: SplitSquareHorizontal,
  howTo: [
    "Drop the first picture in the A box and the second in the B box.",
    "Choose the view: sliding overlay, side by side, or difference.",
    "Read what changed, or adjust the threshold to ignore small shifts.",
  ],
  faq: [
    {
      question: "Why is the difference view unavailable?",
      answer: "Pixel comparison needs both pictures with the same dimensions. The warning above the viewer says both sizes when they differ; resize or crop one first and compare again.",
    },
    {
      question: "What does the threshold do?",
      answer: "Small variations under the threshold, such as JPEG noise or a different quality setting, count as unchanged. Move it up to ignore small shifts, or down to 0 to count every differing pixel.",
    },
    {
      question: "Are my pictures uploaded anywhere?",
      answer: "No. Both pictures are read, compared and drawn within this browser tab.",
    },
  ],
  nextStep: { slug: "image-crop", text: "Spot an area that changed? Crop it out next." },
  related: ["image-crop", "image-compressor", "image-target-size", "image-resizer", "gif-editor"],
});
