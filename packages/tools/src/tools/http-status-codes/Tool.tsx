"use client";

import { Badge, type BadgeTone } from "@toolwright/ui";
import { HTTP_STATUS, httpStatusClass, type HttpStatus } from "@toolwright/core/reference";
import { ReferenceTable } from "../../shared/reference-table";

const TONES: BadgeTone[] = ["neutral", "success", "primary", "danger", "danger"];

export default function Tool() {
  return (
    <ReferenceTable<HttpStatus>
      label="Search status codes"
      placeholder="Search by code, name or meaning, e.g. 404 or redirect"
      rows={HTTP_STATUS}
      rowKey={(r) => r.code}
      searchText={(r) => `${r.code} ${r.name} ${r.description} ${httpStatusClass(r.code)}`}
      columns={[
        { header: "Code", render: (r) => <Badge tone={TONES[Math.floor(r.code / 100) - 1] ?? "neutral"} className="font-mono text-sm">{r.code}</Badge>, className: "px-4 py-2.5 w-24" },
        { header: "Name", render: (r) => <span className="font-medium">{r.name}</span>, className: "px-4 py-2.5 w-64" },
        { header: "Meaning", render: (r) => <span className="text-muted-foreground">{r.description}</span> },
        { header: "Class", render: (r) => <span className="whitespace-nowrap text-muted-foreground">{httpStatusClass(r.code)}</span>, className: "px-4 py-2.5 w-36" },
      ]}
    />
  );
}
