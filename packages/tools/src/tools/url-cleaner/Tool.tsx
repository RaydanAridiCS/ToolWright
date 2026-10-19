"use client";

import { TransformTool } from "@toolwright/ui";
import { stripTracking } from "@toolwright/core/url";

export default function Tool() {
  return (
    <TransformTool
      inputLabel="URLs (one per line)"
      outputLabel="Clean URLs"
      sample={"https://example.com/post?id=7&utm_source=twitter&utm_medium=social&fbclid=IwAR0abc\nhttps://shop.example.com/item?gclid=Cj0K&color=red"}
      transform={(input) =>
        input
          .split(/\r\n|\r|\n/)
          .map((line) => {
            const text = line.trim();
            if (!text) return "";
            try {
              return stripTracking(text);
            } catch {
              return line; // leave anything that is not a URL untouched
            }
          })
          .join("\n")
      }
    />
  );
}
