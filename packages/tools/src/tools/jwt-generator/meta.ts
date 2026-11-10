import { KeyRound } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "jwt-generator",
  name: "JWT Generator & Signer",
  tagline: "Create, sign and customize JSON Web Tokens with HMAC or unsecured algorithms.",
  description:
    "Generate and sign JSON Web Tokens locally. Edit payload claims, set expiry timestamps, select HS256, HS384, HS512 or none, and sign with an HMAC secret key. Everything runs in your browser and secrets never leave your device.",
  primaryKeyword: "jwt generator",
  seoTitle: "JWT Generator: Create & Sign Tokens Online",
  seoDescription:
    "Generate and sign JSON Web Tokens with HS256, HS384, HS512 or unsecured algorithms. Customize payload and expiration. Tokens never leave your browser.",
  answer:
    "JWT Generator creates and signs JSON Web Tokens in your browser. Configure payload claims, set expiry dates and sign with an HMAC secret key (HS256, HS384, HS512) or leave unsecured. No data is sent to any server.",
  category: "developer",
  keywords: ["jwt generator", "jwt builder", "jwt signer", "sign jwt online", "create jwt token", "hmac jwt"],
  icon: KeyRound,
  popular: true,
  howTo: [
    "Edit or paste your payload JSON, or use the quick buttons to set iat and exp timestamps.",
    "Choose your signing algorithm (HS256, HS384, HS512 or none) and enter your secret key.",
    "Copy the signed JWT or use the cURL authorization header shortcut.",
  ],
  faq: [
    {
      question: "Is it safe to enter my secret key here?",
      answer: "Signing happens entirely in your browser using the native Web Crypto API. No token or secret is ever transmitted over the network.",
    },
    {
      question: "What is an unsecured JWT?",
      answer: "An unsecured JWT uses the algorithm 'none', meaning the third part (the signature) is left blank. It is useful for local debugging or when signatures are handled at another layer.",
    },
    {
      question: "Can I verify the generated token?",
      answer: "Yes! Use the 'Open in JWT Decoder' link to verify and inspect the token in Toolwright's JWT Decoder.",
    },
  ],
  nextStep: { slug: "jwt-decoder", text: "Want to inspect or verify an existing token? Try JWT Decoder." },
  related: ["jwt-decoder", "base64-encoder", "hash-generator", "json-formatter"],
});
