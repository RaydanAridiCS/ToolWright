"use client";

import { TransformTool } from "@toolwright/ui";
import { gcd, lcm, primeFactors } from "@toolwright/core/calc";

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)] as string);

function describe(n: number): string {
  const factors = primeFactors(n);
  if (factors.length === 1) return `${n} is prime`;
  const counts = new Map<number, number>();
  for (const f of factors) counts.set(f, (counts.get(f) ?? 0) + 1);
  const product = [...counts].map(([p, e]) => (e > 1 ? `${p}${sup(e)}` : String(p))).join(" × ");
  return `${n} = ${product}`;
}

export default function Tool() {
  return (
    <TransformTool
      inputLabel="Whole numbers (one per line)"
      outputLabel="Factorization"
      sample={"360\n97\n1001\n9007199254740881"}
      transform={(input) => {
        const numbers = input
          .split(/\r\n|\r|\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            if (!/^\d+$/.test(l)) throw new Error(`"${l}" is not a whole number.`);
            return Number(l);
          });
        const lines = numbers.map(describe);
        if (numbers.length > 1) {
          lines.push("", `GCD = ${numbers.reduce((a, b) => gcd(a, b))}`, `LCM = ${numbers.reduce((a, b) => lcm(a, b))}`);
        }
        return lines.join("\n");
      }}
    />
  );
}
