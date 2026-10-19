"use client";

import { TransformTool } from "@toolwright/ui";
import { binaryDecode, binaryEncode, hexDecode, hexEncode } from "@toolwright/core/encoding";

export default function Tool() {
  return (
    <TransformTool
      sample="Hello 👋"
      options={[
        { type: "select", key: "format", label: "Format", default: "hex", options: [{ value: "hex", label: "Hexadecimal" }, { value: "binary", label: "Binary" }] },
        { type: "select", key: "direction", label: "Direction", default: "encode", options: [{ value: "encode", label: "Text → code" }, { value: "decode", label: "Code → text" }] },
        { type: "select", key: "separator", label: "Hex separator", default: " ", options: [{ value: " ", label: "Space" }, { value: "", label: "None" }, { value: ":", label: "Colon" }, { value: ",", label: "Comma" }] },
        { type: "toggle", key: "uppercase", label: "Uppercase hex", default: false },
      ]}
      transform={(input, o) => {
        if (o.format === "binary") return o.direction === "decode" ? binaryDecode(input) : binaryEncode(input);
        return o.direction === "decode" ? hexDecode(input) : hexEncode(input, { separator: String(o.separator), uppercase: Boolean(o.uppercase) });
      }}
    />
  );
}
