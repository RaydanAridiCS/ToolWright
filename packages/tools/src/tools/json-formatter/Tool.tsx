"use client";

import { TransformTool } from "@toolwright/ui";
import { formatJson, minifyJson, repairJson } from "@toolwright/core/json";
import { formatInt } from "../../shared/format";

const SAMPLE = '{"name":"Toolwright","tags":["json","tools"],"nested":{"b":2,"a":1},"private":true}';

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".json,.txt,application/json"
      inputLabel="JSON"
      outputLabel="Result"
      outputFilename="formatted.json"
      outputMime="application/json"
      sample={SAMPLE}
      rows={16}
      options={[
        {
          type: "select",
          key: "mode",
          label: "Action",
          default: "format",
          options: [
            { value: "format", label: "Format (pretty print)" },
            { value: "minify", label: "Minify" },
            { value: "repair", label: "Repair, then format" },
          ],
        },
        {
          type: "select",
          key: "indent",
          label: "Indentation",
          default: "2",
          options: [
            { value: "2", label: "2 spaces" },
            { value: "4", label: "4 spaces" },
            { value: "tab", label: "Tab" },
          ],
        },
        { type: "toggle", key: "sortKeys", label: "Sort keys alphabetically", default: false },
      ]}
      transform={(input, o) => {
        const indent = o.indent === "tab" ? "tab" : Number(o.indent);
        const sortKeys = Boolean(o.sortKeys);
        if (o.mode === "minify") return sortKeys ? minifyJson(formatJson(input, { sortKeys: true })) : minifyJson(input);
        if (o.mode === "repair") return formatJson(repairJson(input), { indent, sortKeys });
        return formatJson(input, { indent, sortKeys });
      }}
      renderExtra={({ input, output }) =>
        input && output ? (
          <p className="text-sm text-muted-foreground">
            Valid JSON. {formatInt(new TextEncoder().encode(input).length)} bytes in, {formatInt(new TextEncoder().encode(output).length)} bytes out.
          </p>
        ) : null
      }
    />
  );
}
