import { Images } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "apng-maker",
  name: "APNG Maker",
  tagline: "Turn a sequence of PNG frames into an animated PNG.",
  description:
    "Combine PNG frames into a single animated PNG (APNG) with your choice of frame delay and loop count. Everything happens in your browser, so your images are never uploaded.",
  primaryKeyword: "apng maker",
  seoTitle: "APNG Maker: Animated PNG from Frames, Free",
  seoDescription:
    "Combine PNG frames into an animated PNG in your browser. Set the frame delay and loop count, then download. Nothing is uploaded.",
  answer:
    "APNG Maker combines a sequence of PNG frames into a single animated PNG file in your browser. You choose the frame delay and loop count, and your images never leave your device.",
  category: "image",
  keywords: [
    "apng maker",
    "create apng",
    "png to apng",
    "animated png maker",
    "make animated png",
    "apng creator",
    "apng animation",
    "convert png to apng",
    "apng frames",
    "animated png online",
  ],
  icon: Images,
  howTo: [
    "Drop two or more PNG frames into the box. They must all be the same size.",
    "Set the frame delay (in milliseconds) and the number of loops. Use 0 loops to play forever.",
    "Click Create APNG and download the animated PNG.",
  ],
  faq: [
    {
      question: "What is an APNG?",
      answer:
        "APNG (Animated Portable Network Graphics) is a PNG-like format that supports animation. Most modern browsers play APNG files natively, unlike static PNG.",
    },
    {
      question: "Are my images uploaded?",
      answer: "No. All frames are processed inside this browser tab and never sent anywhere.",
    },
    {
      question: "Why must all frames be the same size?",
      answer:
        "The APNG specification requires every frame to share the same canvas dimensions. If your frames differ, resize them first with the Image Resizer tool.",
    },
    {
      question: "Can I make the animation loop forever?",
      answer: "Yes. Leave the loop count at 0 and the animation will repeat indefinitely.",
    },
  ],
  nextStep: { slug: "gif-maker", text: "Prefer GIF? Turn images into an animated GIF instead." },
  related: ["gif-maker", "image-resizer", "image-converter", "image-compressor"],
});
