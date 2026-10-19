"use client";

import { TransformTool } from "@toolwright/ui";
import { reverseText } from "@toolwright/core/text";

export default function Tool() {
  return (
    <TransformTool
      inputMono={false}
      outputMono={false}
      sample="Hello, world 👋"
      options={[
        {
          type: "select",
          key: "mode",
          label: "Reverse",
          default: "characters",
          options: [
            { value: "characters", label: "Characters" },
            { value: "words", label: "Word order" },
          ],
        },
      ]}
      transform={(input, o) => reverseText(input, o.mode === "words" ? "words" : "characters")}
    />
  );
}
