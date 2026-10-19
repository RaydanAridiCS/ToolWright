"use client";

import { Badge } from "@toolwright/ui";
import { COMMON_PORTS, type PortInfo } from "@toolwright/core/reference";
import { ReferenceTable } from "../../shared/reference-table";

export default function Tool() {
  return (
    <ReferenceTable<PortInfo>
      label="Search ports"
      placeholder="Search by port or service, e.g. 5432 or redis"
      rows={COMMON_PORTS}
      rowKey={(r) => r.port}
      searchText={(r) => `${r.port} ${r.protocol} ${r.service}`}
      columns={[
        { header: "Port", render: (r) => <code className="font-mono text-base font-semibold">{r.port}</code>, className: "px-4 py-2.5 w-28" },
        { header: "Protocol", render: (r) => <Badge>{r.protocol}</Badge>, className: "px-4 py-2.5 w-32" },
        { header: "Service", render: (r) => r.service },
      ]}
    />
  );
}
