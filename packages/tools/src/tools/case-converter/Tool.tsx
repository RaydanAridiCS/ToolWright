"use client";

import { TransformTool } from "@toolwright/ui";
import { convertCase, type CaseStyle } from "@toolwright/core/text";

const STYLES: { value: CaseStyle; label: string }[] = [
  { value: "camel", label: "camelCase" },
  { value: "pascal", label: "PascalCase" },
  { value: "snake", label: "snake_case" },
  { value: "kebab", label: "kebab-case" },
  { value: "constant", label: "CONSTANT_CASE" },
  { value: "dot", label: "dot.case" },
  { value: "path", label: "path/case" },
  { value: "title", label: "Title Case" },
  { value: "sentence", label: "Sentence case" },
  { value: "upper", label: "UPPER CASE" },
  { value: "lower", label: "lower case" },
  { value: "swap", label: "sWAP cASE" },
];

export default function Tool() {
  return (
    <TransformTool
      inputLabel="Text"
      outputLabel="Converted"
      sample={"hello big world\nuser profile settings"}
      options={[{ type: "select", key: "style", label: "Convert to", default: "camel", options: STYLES }]}
      transform={(input, o) => convertCase(input, o.style as CaseStyle)}
    />
  );
}
