import { Sigma } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "prime-factors",
  name: "Prime Factorization & GCD/LCM",
  tagline: "Factor numbers into primes, and find the GCD and LCM.",
  description: "Break whole numbers into prime factors, check whether they are prime, and find the greatest common divisor and least common multiple of a list. Works up to 2^53.",
  category: "calculators",
  keywords: ["prime factorization", "prime checker", "gcd calculator", "lcm calculator", "factor tree", "is prime"],
  icon: Sigma,
  related: ["number-to-words", "roman-numerals", "number-base-converter"],
});
