import { ShieldCheck } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "json-schema-validator",
  name: "JSON Schema Validator",
  tagline: "Check a JSON document against a JSON Schema and list every violation.",
  description:
    "Paste a JSON Schema and a document, and see every violation by path: wrong types, missing keys, extra keys, ranges, patterns, formats and more. Supports drafts 4, 6, 7, 2019-09 and 2020-12. Everything runs in your browser, so nothing is uploaded.",
  primaryKeyword: "json schema validator",
  seoTitle: "JSON Schema Validator: Validate JSON, Free",
  seoDescription:
    "Validate a JSON document against a JSON Schema and get every violation listed by path, with the keyword that failed. Drafts 4 to 2020-12. Runs in your browser.",
  answer:
    "JSON Schema Validator checks a JSON document against a JSON Schema (drafts 4, 6, 7, 2019-09 and 2020-12) and lists every violation by path, with the keyword that failed. It runs in your browser, so neither the schema nor the data is uploaded.",
  category: "developer",
  keywords: ["json schema validator", "validate json against schema", "json schema check", "json schema online", "json validation", "check json schema"],
  icon: ShieldCheck,
  howTo: [
    "Paste your JSON Schema on the left. The version is read from its $schema keyword.",
    "Paste the JSON document to check on the right.",
    "Read every problem by path, or copy the report.",
  ],
  faq: [
    {
      question: "Which JSON Schema versions are supported?",
      answer:
        "Drafts 4, 6 and 7, plus 2019-09 and 2020-12. The version comes from the schema's $schema keyword, and you can also pick one yourself from the menu.",
    },
    {
      question: "Can the schema use $ref to another file?",
      answer:
        "No, schemas cannot be fetched from the internet because nothing here downloads anything. Put both schemas in the same document instead: define one under \"$defs\" and reference it as \"#/$defs/name\".",
    },
    {
      question: "Is my data uploaded anywhere?",
      answer: "No. Both the schema and the document stay in this browser tab: the check happens locally.",
    },
  ],
  nextStep: { slug: "json-schema-generator", text: "No schema yet? Generate one from a sample of your data." },
  related: ["json-schema-generator", "json-formatter", "json-diff", "jsonpath-tester", "yaml-validator"],
});
