"use client";

import { TransformTool } from "@toolwright/ui";
import { unicodeEscape, unicodeUnescape } from "@toolwright/core/encoding";

export default function Tool() {
  return (
    <TransformTool
      sample="Café — 你好 😀"
      options={[{ type: "select", key: "direction", label: "Direction", default: "escape", options: [{ value: "escape", label: "Text → \\uXXXX" }, { value: "unescape", label: "\\uXXXX → text" }] }]}
      transform={(input, o) => (o.direction === "unescape" ? unicodeUnescape(input) : unicodeEscape(input))}
    />
  );
}
