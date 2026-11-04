import { FileText } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "toml-validator",
  name: "TOML Validator",
  tagline: "Check TOML syntax and convert it to JSON in your browser.",
  description:
    "Paste a TOML document to validate it against the TOML 1.0 spec and see the equivalent JSON. Your document is parsed in the browser and never uploaded.",
  category: "developer",
  keywords: [
    "toml validator",
    "validate toml",
    "toml to json",
    "toml checker",
    "toml linter",
    "toml parser",
    "toml syntax checker",
    "convert toml to json",
  ],
  icon: FileText,
  howTo: [
    "Paste your TOML document into the left editor.",
    "Read the validation result and any line or column error.",
    "Copy the JSON conversion from the right editor.",
  ],
  faq: [
    {
      question: "Is my TOML uploaded?",
      answer:
        "No. The document is parsed entirely in your browser by @ltd/j-toml. Nothing is sent to a server.",
    },
    {
      question: "Which TOML version is supported?",
      answer: "TOML 1.0. The parser follows the TOML 1.0 specification.",
    },
    {
      question: "Can it convert JSON back to TOML?",
      answer: "Not yet. This tool only converts TOML to JSON.",
    },
  ],
  primaryKeyword: "toml validator",
  seoTitle: "TOML Validator: Check & Convert to JSON",
  seoDescription:
    "Validate TOML syntax and convert TOML to JSON instantly. Errors show line and column. Free, no upload, no sign-up.",
  answer:
    "TOML Validator checks your TOML document against the TOML 1.0 specification and converts it to JSON. Paste the document, see any syntax errors with line and column numbers, and copy the JSON output. Everything runs in your browser.",
  nextStep: { slug: "json-formatter", text: "Format or minify the JSON output next." },
  related: ["json-formatter", "yaml-validator", "json-yaml-converter"],
});
