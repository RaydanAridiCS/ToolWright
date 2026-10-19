"use client";

import { TransformTool } from "@toolwright/ui";
import { slugify } from "@toolwright/core/text";

export default function Tool() {
  return (
    <TransformTool
      inputLabel="Titles (one per line)"
      outputLabel="Slugs"
      sample={"Crème Brûlée & Friends: A Recipe!\n10 Tips for Better Sleep"}
      inputMono={false}
      options={[
        {
          type: "select",
          key: "separator",
          label: "Separator",
          default: "-",
          options: [
            { value: "-", label: "Hyphen ( - )" },
            { value: "_", label: "Underscore ( _ )" },
            { value: ".", label: "Dot ( . )" },
          ],
        },
        { type: "toggle", key: "lowercase", label: "Lowercase", default: true },
        { type: "number", key: "maxLength", label: "Max length (0 = unlimited)", default: 0, min: 0, max: 200 },
      ]}
      transform={(input, o) =>
        input
          .split(/\r\n|\r|\n/)
          .map((line) => slugify(line, { separator: String(o.separator), lowercase: Boolean(o.lowercase), maxLength: Number(o.maxLength) || undefined }))
          .join("\n")
      }
    />
  );
}
