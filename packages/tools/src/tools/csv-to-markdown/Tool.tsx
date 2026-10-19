"use client";

import { TransformTool } from "@toolwright/ui";
import { csvToMarkdownTable } from "@toolwright/core/convert";

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".csv,.tsv,.txt"
      inputLabel="CSV / TSV"
      outputLabel="Markdown table"
      outputFilename="table.md"
      sample={"Tool,Category,Private\nJSON Formatter,Developer,Yes\nPDF Merge,PDF,Yes"}
      transform={(input) => csvToMarkdownTable(input)}
    />
  );
}
