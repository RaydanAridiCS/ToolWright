"use client";

import { TransformTool } from "@toolwright/ui";
import { csvToJson, jsonToCsv, type Delimiter } from "@toolwright/core/convert";

const DELIMITERS = [
  { value: ",", label: "Comma ( , )" },
  { value: "\t", label: "Tab" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "|", label: "Pipe ( | )" },
];

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".json,.csv,.tsv,.txt"
      inputLabel="Input"
      outputLabel="Output"
      outputFilename="converted.txt"
      sample={'[{"name":"Ada","age":36,"address":{"city":"London"}},{"name":"Linus","age":55,"address":{"city":"Portland"}}]'}
      rows={14}
      options={[
        { type: "select", key: "direction", label: "Convert", default: "json-csv", options: [{ value: "json-csv", label: "JSON → CSV" }, { value: "csv-json", label: "CSV → JSON" }] },
        { type: "select", key: "delimiter", label: "Delimiter (CSV → JSON detects it automatically)", default: ",", options: DELIMITERS },
        { type: "toggle", key: "flatten", label: "Flatten nested objects (JSON → CSV)", default: true },
        { type: "toggle", key: "header", label: "First row is a header", default: true },
        { type: "toggle", key: "typed", label: "Convert numbers & booleans (CSV → JSON)", default: true },
        { type: "toggle", key: "unflatten", label: "Rebuild nested objects from a.b headers", default: false },
      ]}
      transform={(input, o) =>
        o.direction === "csv-json"
          ? csvToJson(input, { header: Boolean(o.header), typed: Boolean(o.typed), unflatten: Boolean(o.unflatten) })
          : jsonToCsv(input, { delimiter: o.delimiter as Delimiter, flatten: Boolean(o.flatten), header: Boolean(o.header) })
      }
    />
  );
}
