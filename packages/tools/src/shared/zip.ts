import { zipSync } from "fflate";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Create a ZIP archive in memory. Duplicate names get " (2)", " (3)"… appended. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    let name = entry.name;
    for (let i = 2; name in files; i++) {
      const dot = entry.name.lastIndexOf(".");
      name = dot > 0 ? `${entry.name.slice(0, dot)} (${i})${entry.name.slice(dot)}` : `${entry.name} (${i})`;
    }
    files[name] = entry.data;
  }
  // Already-compressed formats (JPEG, PNG, PDF…) gain nothing from deflate, so store them.
  return zipSync(files, { level: 0 });
}
