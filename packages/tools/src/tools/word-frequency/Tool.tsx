"use client";

import { TransformTool } from "@toolwright/ui";
import { wordFrequency } from "@toolwright/core/text";

export default function Tool() {
  return (
    <TransformTool
      inputMono={false}
      sample="The quick brown fox jumps over the lazy dog. The dog barks; the fox runs away."
      options={[{ type: "number", key: "limit", label: "Show top", default: 25, min: 1, max: 500 }]}
      outputFilename="word-frequency.txt"
      transform={(input, o) => {
        const rows = wordFrequency(input, Number(o.limit) || 25);
        const width = Math.max(...rows.map((r) => String(r.count).length), 1);
        return rows.map((r) => `${String(r.count).padStart(width)}  ${r.word}`).join("\n");
      }}
    />
  );
}
