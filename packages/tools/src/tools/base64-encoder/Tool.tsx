"use client";

import { TransformTool } from "@toolwright/ui";
import { base64Decode, base64Encode } from "@toolwright/core/encoding";

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".txt"
      sample="Hello, Toolwright! héllo 世界 🚀"
      options={[
        { type: "select", key: "direction", label: "Direction", default: "encode", options: [{ value: "encode", label: "Encode to Base64" }, { value: "decode", label: "Decode from Base64" }] },
        { type: "toggle", key: "urlSafe", label: "URL-safe alphabet (- and _)", default: false },
        { type: "toggle", key: "padding", label: "Keep = padding", default: true },
      ]}
      transform={(input, o) => (o.direction === "decode" ? base64Decode(input) : base64Encode(input, { urlSafe: Boolean(o.urlSafe), padding: Boolean(o.padding) }))}
    />
  );
}
