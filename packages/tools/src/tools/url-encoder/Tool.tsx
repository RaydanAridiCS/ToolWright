"use client";

import { TransformTool } from "@toolwright/ui";
import { urlDecode, urlEncode } from "@toolwright/core/encoding";

export default function Tool() {
  return (
    <TransformTool
      sample="https://example.com/search?q=café & crème&lang=fr"
      options={[
        { type: "select", key: "direction", label: "Direction", default: "encode", options: [{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" }] },
        { type: "select", key: "mode", label: "Mode", default: "component", options: [{ value: "component", label: "Component (query values)" }, { value: "full", label: "Full URL (keep : / ? #)" }] },
      ]}
      transform={(input, o) => (o.direction === "decode" ? urlDecode(input, o.mode as "component" | "full") : urlEncode(input, o.mode as "component" | "full"))}
    />
  );
}
