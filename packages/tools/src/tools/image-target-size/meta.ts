import { Target } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "image-target-size",
  name: "Compress to Target Size",
  tagline: "Shrink an image until it fits under a size you choose, such as 100 kB.",
  description:
    "Pick a target in kilobytes and the picture is encoded at the best quality that stays under it; when no quality can do that, the picture is made smaller instead. Files already under the target are left untouched. Batch-friendly, and everything runs in your browser, so nothing is uploaded.",
  primaryKeyword: "compress image to specific size",
  seoTitle: "Compress Image to Specific Size, Free",
  seoDescription:
    "Compress a JPG, PNG or WebP until it fits under a size in kilobytes, for upload limits. Best quality under the limit, background work stays on your device.",
  answer:
    "Compress to Target Size encodes an image at the best quality that stays under a specific size you choose in kilobytes, and makes the picture smaller when no quality can reach it. It runs in your browser, so the picture is never uploaded.",
  category: "image",
  keywords: ["compress image to specific size", "compress image to 100kb", "compress image to 200kb", "shrink image under kb", "photo size reducer", "image compressor under limit"],
  icon: Target,
  howTo: [
    "Drop the pictures you need to shrink.",
    "Type the size in kilobytes each file should stay under.",
    "Download files that fit; the original is kept when it already did.",
  ],
  faq: [
    {
      question: "What happens if the picture cannot be encoded under the target?",
      answer:
        "First the quality is lowered as far as it will go. If that still does not fit, the picture is also made smaller, unless you turn that option off. The tool says plainly when a picture could not reach the target and what the smallest encoding was.",
    },
    {
      question: "Does it keep the original file if it is already small enough?",
      answer: "Yes. A picture that already fits the target is handed back untouched, without being re-encoded.",
    },
    {
      question: "Is my picture uploaded anywhere?",
      answer: "No. The search for the best quality, the resizing and the saving all happen in this browser tab.",
    },
  ],
  nextStep: { slug: "image-compressor", text: "Don't need a size limit? Compress with a quality slider instead." },
  related: ["image-compressor", "image-resizer", "image-converter", "image-crop", "images-to-pdf"],
});
