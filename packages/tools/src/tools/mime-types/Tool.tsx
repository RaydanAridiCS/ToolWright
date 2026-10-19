"use client";

import { CopyButton } from "@toolwright/ui";
import { MIME_TYPES, type MimeType } from "@toolwright/core/reference";
import { ReferenceTable } from "../../shared/reference-table";

export default function Tool() {
  return (
    <ReferenceTable<MimeType>
      label="Search MIME types"
      placeholder="Search by extension or type, e.g. png or application/json"
      rows={MIME_TYPES}
      rowKey={(r) => `${r.extension}-${r.mime}`}
      searchText={(r) => `.${r.extension} ${r.extension} ${r.mime} ${r.description}`}
      columns={[
        { header: "Extension", render: (r) => <code className="font-mono">.{r.extension}</code>, className: "px-4 py-2.5 w-32" },
        { header: "MIME type", render: (r) => <code className="break-all font-mono text-[13px]">{r.mime}</code> },
        { header: "Description", render: (r) => <span className="text-muted-foreground">{r.description}</span> },
        { header: "", render: (r) => <CopyButton text={r.mime} size="sm" variant="ghost" />, className: "px-2 py-1.5 w-24" },
      ]}
    />
  );
}
