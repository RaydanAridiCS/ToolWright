import { Binary } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "number-base-converter",
  name: "Number Base Converter",
  tagline: "Binary, octal, decimal, hex and any base from 2 to 36.",
  description:
    "Convert integers between binary, octal, decimal, hexadecimal and any base up to 36, with arbitrary precision (BigInt) so very large numbers stay exact. Prefixes like 0x and 0b are understood.",
  category: "calculators",
  keywords: ["binary converter", "hex to decimal", "decimal to binary", "base converter", "octal converter", "bigint"],
  icon: Binary,
  related: ["hex-binary-converter", "chmod-calculator", "roman-numerals"],
});
