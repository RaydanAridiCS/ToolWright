import { Languages } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "unicode-escape",
  name: "Unicode Escape & Unescape",
  tagline: "Convert characters to \\uXXXX escapes and back.",
  description:
    "Turn non-ASCII characters and emoji into \\uXXXX escape sequences for source code, or decode \\uXXXX and \\u{...} sequences back into readable text.",
  category: "encoding",
  keywords: ["unicode escape", "unicode to text", "u escape sequence", "emoji to unicode", "utf-16 escape"],
  icon: Languages,
  related: ["string-escape", "hex-binary-converter", "html-entities"],
});
