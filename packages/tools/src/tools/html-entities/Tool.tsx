"use client";

import { TransformTool } from "@toolwright/ui";
import { htmlEscape, htmlUnescape } from "@toolwright/core/encoding";

export default function Tool() {
  return (
    <TransformTool
      sample={`<a href="/search?q=1&lang=en">Tom & Jerry's "show"</a>`}
      options={[{ type: "select", key: "direction", label: "Direction", default: "encode", options: [{ value: "encode", label: "Escape (text → entities)" }, { value: "decode", label: "Unescape (entities → text)" }] }]}
      transform={(input, o) => (o.direction === "decode" ? htmlUnescape(input) : htmlEscape(input))}
    />
  );
}
