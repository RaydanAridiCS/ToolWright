import { KeyRound } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "jwt-decoder",
  name: "JWT Decoder",
  tagline: "Decode and inspect JSON Web Tokens, and verify HMAC signatures.",
  description:
    "Decode the header and payload of any JWT, see expiry and issued-at times in plain English, and verify HS256/HS384/HS512 signatures with your secret. Tokens are decoded locally and never transmitted.",
  category: "developer",
  keywords: ["jwt decoder", "jwt debugger", "decode jwt", "json web token", "jwt expiry", "verify jwt"],
  icon: KeyRound,
  popular: true,
  faq: [
    { question: "Is it safe to paste a real token here?", answer: "Decoding happens entirely in your browser and the page makes no network requests. Even so, treat production tokens as secrets and prefer test tokens when you can." },
    { question: "Does decoding mean the token is valid?", answer: "No. Anyone can decode a JWT. Only verifying the signature with the right key proves it was issued by a trusted party and was not modified." },
  ],
  related: ["base64-encoder", "json-formatter", "timestamp-converter", "hash-generator"],
});
