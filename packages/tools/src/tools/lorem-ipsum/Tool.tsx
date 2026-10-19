"use client";

import { TransformTool } from "@toolwright/ui";
import { generateLorem, type LoremUnit } from "@toolwright/core/lorem";

export default function Tool() {
  return (
    <TransformTool
      hideInput
      runOnEmpty
      regenerate
      shareable={false}
      outputLabel="Generated text"
      outputMono={false}
      rows={14}
      options={[
        {
          type: "select",
          key: "unit",
          label: "Generate",
          default: "paragraphs",
          options: [
            { value: "paragraphs", label: "Paragraphs" },
            { value: "sentences", label: "Sentences" },
            { value: "words", label: "Words" },
          ],
        },
        { type: "number", key: "count", label: "Amount", default: 3, min: 1, max: 1000 },
        { type: "toggle", key: "classicStart", label: 'Start with "Lorem ipsum dolor sit amet"', default: true },
        { type: "toggle", key: "html", label: "Wrap paragraphs in <p> tags", default: false },
      ]}
      transform={(_input, o) =>
        generateLorem({ unit: o.unit as LoremUnit, count: Math.min(1000, Math.max(1, Number(o.count) || 1)), classicStart: Boolean(o.classicStart), html: Boolean(o.html) })
      }
    />
  );
}
