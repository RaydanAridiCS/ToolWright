import { Binary } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "hex-binary-converter",
  name: "Text to Hex & Binary Converter",
  tagline: "Convert text to hexadecimal or binary and back.",
  description:
    "Encode any text as UTF-8 hexadecimal or 8-bit binary, or decode hex and binary strings back to text. Choose separators and letter case. All in your browser.",
  category: "encoding",
  keywords: ["text to hex", "hex to text", "text to binary", "binary to text", "ascii to hex"],
  icon: Binary,
  related: ["base64-encoder", "number-base-converter", "unicode-escape"],
});
