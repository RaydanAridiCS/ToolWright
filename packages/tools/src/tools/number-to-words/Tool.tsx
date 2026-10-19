"use client";

import { TransformTool } from "@toolwright/ui";
import { numberToWords } from "@toolwright/core/calc";

export default function Tool() {
  return (
    <TransformTool
      inputLabel="Whole numbers (one per line)"
      outputLabel="In words"
      inputMono={false}
      outputMono={false}
      sample={"1234567\n42\n-15\n1000000000000"}
      transform={(input) =>
        input
          .split(/\r\n|\r|\n/)
          .map((line) => {
            const text = line.trim().replace(/[,_\s]/g, "");
            if (!text) return "";
            if (!/^-?\d+$/.test(text)) throw new Error(`"${line.trim()}" is not a whole number.`);
            return numberToWords(BigInt(text));
          })
          .join("\n")
      }
    />
  );
}
