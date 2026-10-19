"use client";

import { TransformTool } from "@toolwright/ui";
import { escapeString, unescapeString } from "@toolwright/core/encoding";

type Language = Parameters<typeof escapeString>[1];

export default function Tool() {
  return (
    <TransformTool
      sample={"He said \"hi\"\nand left.\tTab included. It's fine."}
      options={[
        { type: "select", key: "direction", label: "Direction", default: "escape", options: [{ value: "escape", label: "Escape" }, { value: "unescape", label: "Unescape" }] },
        {
          type: "select",
          key: "language",
          label: "Language (for escaping)",
          default: "json",
          options: [
            { value: "json", label: "JSON" },
            { value: "javascript", label: "JavaScript" },
            { value: "python", label: "Python" },
            { value: "csharp", label: "C#" },
            { value: "sql", label: "SQL (single quotes)" },
            { value: "shell", label: "POSIX shell" },
          ],
        },
      ]}
      transform={(input, o) => (o.direction === "unescape" ? unescapeString(input) : escapeString(input, o.language as Language))}
    />
  );
}
