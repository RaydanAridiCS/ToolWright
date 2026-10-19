"use client";

import { TransformTool } from "@toolwright/ui";
import { nanoid, ulid, uuidV4, uuidV7 } from "@toolwright/core/ids";

export default function Tool() {
  return (
    <TransformTool
      hideInput
      runOnEmpty
      regenerate
      shareable={false}
      outputLabel="Generated IDs"
      outputFilename="ids.txt"
      rows={12}
      options={[
        {
          type: "select",
          key: "type",
          label: "Type",
          default: "uuid-v4",
          options: [
            { value: "uuid-v4", label: "UUID v4 (random)" },
            { value: "uuid-v7", label: "UUID v7 (time-ordered)" },
            { value: "ulid", label: "ULID (sortable)" },
            { value: "nanoid", label: "NanoID (compact)" },
          ],
        },
        { type: "number", key: "count", label: "How many", default: 5, min: 1, max: 1000 },
        { type: "number", key: "nanoidLength", label: "NanoID length", default: 21, min: 4, max: 64 },
        { type: "toggle", key: "uppercase", label: "Uppercase", default: false },
        { type: "toggle", key: "hyphens", label: "Keep hyphens (UUIDs)", default: true },
      ]}
      transform={(_input, o) => {
        const count = Math.min(1000, Math.max(1, Number(o.count) || 1));
        const length = Math.min(64, Math.max(4, Number(o.nanoidLength) || 21));
        const make = () => {
          switch (o.type) {
            case "uuid-v7":
              return uuidV7();
            case "ulid":
              return ulid();
            case "nanoid":
              return nanoid(length);
            default:
              return uuidV4();
          }
        };
        return Array.from({ length: count }, () => {
          let id = make();
          if (o.type?.toString().startsWith("uuid") && !o.hyphens) id = id.replace(/-/g, "");
          return o.uppercase ? id.toUpperCase() : id;
        }).join("\n");
      }}
    />
  );
}
