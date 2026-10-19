"use client";

import { TransformTool } from "@toolwright/ui";
import { processLines, type LineOptions } from "@toolwright/core/text";

export default function Tool() {
  return (
    <TransformTool
      inputLabel="Lines"
      outputLabel="Result"
      sample={"banana\napple\nCherry\napple\n\nbanana\nfile10\nfile2"}
      options={[
        {
          type: "select",
          key: "sort",
          label: "Sort",
          default: "none",
          options: [
            { value: "none", label: "Keep order" },
            { value: "asc", label: "A → Z" },
            { value: "desc", label: "Z → A" },
            { value: "natural", label: "Natural (file2 before file10)" },
            { value: "length", label: "By length" },
            { value: "random", label: "Shuffle" },
          ],
        },
        { type: "toggle", key: "dedupe", label: "Remove duplicates", default: true },
        { type: "toggle", key: "removeEmpty", label: "Remove empty lines", default: true },
        { type: "toggle", key: "trim", label: "Trim each line", default: false },
        { type: "toggle", key: "caseInsensitive", label: "Ignore case", default: false },
        { type: "toggle", key: "reverse", label: "Reverse order", default: false },
      ]}
      transform={(input, o) => processLines(input, o as unknown as LineOptions)}
      renderExtra={({ input, output }) => {
        if (!input) return null;
        const before = input.split(/\r\n|\r|\n/).length;
        const after = output ? output.split("\n").length : 0;
        return (
          <p className="text-sm text-muted-foreground">
            {before} line{before === 1 ? "" : "s"} in, {after} line{after === 1 ? "" : "s"} out.
          </p>
        );
      }}
    />
  );
}
