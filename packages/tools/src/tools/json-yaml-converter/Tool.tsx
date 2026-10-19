"use client";

import { TransformTool } from "@toolwright/ui";
import { jsonToYaml, yamlToJson } from "@toolwright/core/convert";

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".json,.yaml,.yml,.txt"
      inputLabel="Input"
      outputLabel="Output"
      outputFilename="converted.txt"
      sample={'{"name":"web","image":"nginx:1.27","ports":["80:80","443:443"],"env":{"MODE":"production"}}'}
      rows={14}
      options={[
        { type: "select", key: "direction", label: "Convert", default: "json-yaml", options: [{ value: "json-yaml", label: "JSON → YAML" }, { value: "yaml-json", label: "YAML → JSON" }] },
        { type: "select", key: "indent", label: "Indentation", default: "2", options: [{ value: "2", label: "2 spaces" }, { value: "4", label: "4 spaces" }] },
        { type: "toggle", key: "sortKeys", label: "Sort keys (JSON → YAML)", default: false },
      ]}
      transform={(input, o) =>
        o.direction === "yaml-json" ? yamlToJson(input, Number(o.indent)) : jsonToYaml(input, { indent: Number(o.indent), sortKeys: Boolean(o.sortKeys) })
      }
    />
  );
}
