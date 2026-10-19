import { Lock } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "text-ciphers",
  name: "ROT13, Caesar & Morse Code",
  tagline: "Classic ciphers for puzzles, games and learning.",
  description:
    "Encode and decode ROT13, Caesar shifts and Morse code. These ciphers are for fun and puzzles only and provide no real security. Runs in your browser.",
  category: "encoding",
  keywords: ["rot13", "caesar cipher", "morse code translator", "text cipher", "encode morse"],
  icon: Lock,
  related: ["base64-encoder", "text-reverser", "hex-binary-converter"],
});
