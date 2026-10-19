"use client";

import { TransformTool } from "@toolwright/ui";
import { convertDelimiter, type Delimiter } from "@toolwright/core/convert";

const TARGETS = [
  { value: ",", label: "Comma ( , )" },
  { value: "\t", label: "Tab" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "|", label: "Pipe ( | )" },
];

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".csv,.tsv,.txt"
      sample={'name;city\nAda;"London; UK"\nLinus;Portland'}
      outputFilename="converted.csv"
      options={[
        { type: "select", key: "from", label: "Input delimiter", default: "auto", options: [{ value: "auto", label: "Detect automatically" }, ...TARGETS] },
        { type: "select", key: "to", label: "Output delimiter", default: ",", options: TARGETS },
      ]}
      transform={(input, o) => convertDelimiter(input, o.from as Delimiter | "auto", o.to as Delimiter)}
    />
  );
}
