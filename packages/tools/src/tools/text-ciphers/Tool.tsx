"use client";

import { TransformTool } from "@toolwright/ui";
import { morseDecode, morseEncode, rot13 } from "@toolwright/core/encoding";

export default function Tool() {
  return (
    <TransformTool
      sample="Hello World"
      options={[
        { type: "select", key: "cipher", label: "Cipher", default: "rot13", options: [{ value: "rot13", label: "ROT13" }, { value: "caesar", label: "Caesar shift" }, { value: "morse", label: "Morse code" }] },
        { type: "select", key: "direction", label: "Direction (Caesar & Morse)", default: "encode", options: [{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" }] },
        { type: "number", key: "shift", label: "Caesar shift", default: 3, min: 1, max: 25 },
      ]}
      transform={(input, o) => {
        if (o.cipher === "morse") return o.direction === "decode" ? morseDecode(input) : morseEncode(input);
        if (o.cipher === "caesar") return rot13(input, o.direction === "decode" ? -Number(o.shift) : Number(o.shift));
        return rot13(input);
      }}
    />
  );
}
