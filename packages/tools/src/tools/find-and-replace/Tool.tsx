"use client";

import { TransformTool } from "@toolwright/ui";
import { findReplace } from "@toolwright/core/text";

export default function Tool() {
  return (
    <TransformTool
      sample="The cat sat on the mat. Another cat appeared."
      options={[
        { type: "text", key: "find", label: "Find", default: "cat", placeholder: "Text or pattern" },
        { type: "text", key: "replace", label: "Replace with", default: "dog", placeholder: "Replacement (use $1 for groups in regex mode)" },
        { type: "toggle", key: "regex", label: "Regular expression", default: false },
        { type: "toggle", key: "caseSensitive", label: "Match case", default: false },
        { type: "toggle", key: "wholeWord", label: "Whole words only", default: false },
      ]}
      transform={(input, o) => {
        try {
          return findReplace(input, String(o.find), String(o.replace), { regex: Boolean(o.regex), caseSensitive: Boolean(o.caseSensitive), wholeWord: Boolean(o.wholeWord) }).output;
        } catch (err) {
          throw new Error(`Invalid pattern: ${err instanceof Error ? err.message : String(err)}`);
        }
      }}
      renderExtra={({ input, options }) => {
        if (!input || !options.find) return null;
        try {
          const { count } = findReplace(input, String(options.find), String(options.replace), {
            regex: Boolean(options.regex),
            caseSensitive: Boolean(options.caseSensitive),
            wholeWord: Boolean(options.wholeWord),
          });
          return (
            <p className="text-sm text-muted-foreground">
              {count} replacement{count === 1 ? "" : "s"} made.
            </p>
          );
        } catch {
          return null;
        }
      }}
    />
  );
}
