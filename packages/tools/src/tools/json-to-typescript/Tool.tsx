"use client";

import { TransformTool } from "@toolwright/ui";
import { jsonToTypeScript } from "@toolwright/core/json";

const SAMPLE = JSON.stringify(
  {
    id: 1,
    name: "Ada Lovelace",
    email: "ada@example.com",
    address: { city: "London", geo: { lat: 51.5, lng: -0.12 } },
    roles: ["admin", "editor"],
    posts: [
      { id: 10, title: "Notes", draft: false },
      { id: 11, title: "Engine", tags: ["math"] },
    ],
    deletedAt: null,
  },
  null,
  2,
);

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".json,.txt"
      inputLabel="JSON sample"
      outputLabel="TypeScript"
      outputFilename="types.ts"
      sample={SAMPLE}
      rows={16}
      options={[
        { type: "text", key: "rootName", label: "Root type name", default: "Root" },
        { type: "select", key: "style", label: "Declaration style", default: "interface", options: [{ value: "interface", label: "interface" }, { value: "type", label: "type alias" }] },
        { type: "toggle", key: "exportTypes", label: "Add export", default: true },
        { type: "toggle", key: "readonly", label: "Readonly properties", default: false },
      ]}
      transform={(input, o) =>
        jsonToTypeScript(input, {
          rootName: String(o.rootName).trim() || "Root",
          useType: o.style === "type",
          exportTypes: Boolean(o.exportTypes),
          readonly: Boolean(o.readonly),
        })
      }
    />
  );
}
