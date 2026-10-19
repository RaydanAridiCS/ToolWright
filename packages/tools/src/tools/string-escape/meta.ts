import { Code } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "string-escape",
  name: "String Escape & Unescape",
  tagline: "Escape text for JSON, JavaScript, Python, SQL or the shell.",
  description:
    "Escape quotes, newlines and backslashes so text can live inside a string literal in JSON, JavaScript, Python, C#, SQL or a POSIX shell, or unescape sequences like \\n, \\t and \\u00e9 back to characters.",
  category: "encoding",
  keywords: ["escape string", "unescape string", "json escape", "sql escape", "shell escape", "backslash escape"],
  icon: Code,
  related: ["html-entities", "json-formatter", "unicode-escape"],
});
