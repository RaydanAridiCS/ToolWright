"use client";

import { TransformTool } from "@toolwright/ui";
import { fromRoman, toRoman } from "@toolwright/core/calc";

export default function Tool() {
  return (
    <TransformTool
      inputLabel="Numbers or Roman numerals (one per line)"
      outputLabel="Converted"
      sample={"1994\nMMXXVI\n2026\nXLII"}
      transform={(input) =>
        input
          .split(/\r\n|\r|\n/)
          .map((line) => {
            const text = line.trim();
            if (!text) return "";
            return /^\d+$/.test(text) ? toRoman(Number(text)) : String(fromRoman(text));
          })
          .join("\n")
      }
    />
  );
}
