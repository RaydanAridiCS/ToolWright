import { Binary } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "base64-encoder",
  name: "Base64 Encode & Decode",
  tagline: "Encode text to Base64 or decode it back, UTF-8 safe.",
  description:
    "Encode or decode Base64 with full Unicode support, URL-safe output and optional padding removal. Handy for JWTs, data URIs and API payloads. Everything stays in your browser.",
  category: "encoding",
  keywords: ["base64 encode", "base64 decode", "base64 converter", "url safe base64", "base64url", "decode base64"],
  icon: Binary,
  popular: true,
  faq: [
    {
      question: "What is URL-safe Base64?",
      answer: "It swaps + and / for - and _ so the result can be used in URLs and filenames without escaping, and often drops the = padding. JWTs use this variant.",
    },
  ],
  related: ["image-to-base64", "jwt-decoder", "hex-binary-converter", "url-encoder"],
});
