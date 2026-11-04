import { Braces } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "graphql-validator",
  name: "GraphQL Query Validator",
  tagline: "Check a GraphQL query against a schema without sending it anywhere.",
  description:
    "Paste a GraphQL query and an optional schema (SDL). The tool reports syntax errors and schema violations, with line and column numbers. Everything is checked in your browser; nothing is sent to a server.",
  category: "developer",
  keywords: [
    "graphql validator",
    "validate graphql query",
    "graphql query checker",
    "graphql schema validator",
    "graphql lint",
    "graphql syntax check",
    "graphql query validation",
  ],
  icon: Braces,
  howTo: [
    "Paste the GraphQL query or mutation you want to check.",
    "Optionally paste the GraphQL schema in SDL format.",
    "Read the validation result and fix any errors.",
  ],
  faq: [
    {
      question: "Is my query sent to a server?",
      answer:
        "No. The query and schema are validated locally by graphql-js in your browser. They never leave the tab.",
    },
    {
      question: "Do I need to provide a schema?",
      answer:
        "No. Without a schema, the tool checks that the query is valid GraphQL syntax. With a schema, it also checks that fields, arguments and types match.",
    },
    {
      question: "Does it execute the query?",
      answer: "No. It only parses and validates the query; no resolver is run and no network request is made.",
    },
  ],
  primaryKeyword: "graphql validator",
  seoTitle: "GraphQL Validator: Check Query & Schema",
  seoDescription:
    "Validate GraphQL queries against a schema in your browser. Get syntax and type errors with line numbers. No upload, no execution, no sign-up.",
  answer:
    "GraphQL Query Validator checks a GraphQL query against an optional schema in your browser. Paste the query and schema, and see syntax errors and schema violations with line and column numbers. Nothing is sent to a server and the query is never executed.",
  nextStep: { slug: "graphql-formatter", text: "Format or minify the query next." },
  related: ["graphql-formatter", "json-schema-validator", "yaml-validator"],
});
