"use client";

import { TransformTool } from "@toolwright/ui";
import { cleanWhitespace } from "@toolwright/core/text";

export default function Tool() {
  return (
    <TransformTool
      inputMono={false}
      outputMono={false}
      sample={"  This   text has   odd spacing.  \n\n\n\n  And too many   blank lines.   "}
      options={[
        { type: "toggle", key: "collapseSpaces", label: "Collapse repeated spaces", default: true },
        { type: "toggle", key: "trimLines", label: "Trim each line", default: true },
        { type: "toggle", key: "collapseBlankLines", label: "Collapse blank lines", default: true },
        { type: "toggle", key: "removeLineBreaks", label: "Remove all line breaks", default: false },
      ]}
      transform={(input, o) =>
        cleanWhitespace(input, {
          collapseSpaces: Boolean(o.collapseSpaces),
          trimLines: Boolean(o.trimLines),
          collapseBlankLines: Boolean(o.collapseBlankLines),
          removeLineBreaks: Boolean(o.removeLineBreaks),
        })
      }
    />
  );
}
