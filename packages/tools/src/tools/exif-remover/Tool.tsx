"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, DownloadButton, FileDropzone, Panel, Toggle, formatFileSize } from "@toolwright/ui";
import { stripImageMetadata, type RemovedItem } from "@toolwright/core/image-meta";
import { createZip } from "../../shared/zip";
import { errorMessage } from "../../shared/format";

interface Cleaned {
  id: string;
  name: string;
  originalSize: number;
  data: Uint8Array;
  mime: string;
  removed: RemovedItem[];
  error?: undefined;
}
interface Failed {
  id: string;
  name: string;
  error: string;
}

const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export default function Tool() {
  const [files, setFiles] = useState<File[]>([]);
  const [keepProfile, setKeepProfile] = useState(true);
  const [results, setResults] = useState<(Cleaned | Failed)[]>([]);
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: (Cleaned | Failed)[] = [];
      for (const [i, file] of files.entries()) {
        const id = `${i}-${file.name}-${file.size}`;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { data, removed, kind } = stripImageMetadata(bytes, { keepColorProfile: keepProfile });
          out.push({ id, name: file.name, originalSize: file.size, data, mime: kind in MIME ? MIME[kind as keyof typeof MIME] : "application/octet-stream", removed });
        } catch (err) {
          out.push({ id, name: file.name, error: errorMessage(err) });
        }
      }
      if (!cancelled) setResults(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [files, keepProfile]);

  const cleaned = results.filter((r): r is Cleaned => !("error" in r && r.error));
  const cleanName = (n: string) => n.replace(/(\.[^.]+)?$/, "-clean$1");

  return (
    <div className="flex flex-col gap-5">
      <FileDropzone accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple label="Drop photos here, or click to browse" hint="JPEG, PNG and WebP. Nothing is uploaded and image quality is untouched." onReject={setRejected} onFiles={(f) => (setRejected(null), setFiles((c) => [...c, ...f]))} />
      {rejected ? <Alert tone="warning">{rejected}</Alert> : null}
      <Toggle label="Keep the embedded color profile" hint="Recommended: keeps colors looking identical. Turn off to remove it as well." checked={keepProfile} onCheckedChange={setKeepProfile} />

      {results.length > 0 ? (
        <Panel
          title={`${results.length} file${results.length === 1 ? "" : "s"}`}
          actions={
            <>
              {cleaned.length > 1 ? (
                <DownloadButton data={createZip(cleaned.map((c) => ({ name: cleanName(c.name), data: c.data })))} filename="clean-images.zip" mime="application/zip" label="Download all (ZIP)" variant="primary" size="sm" />
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => (setFiles([]), setResults([]))}>
                Clear
              </Button>
            </>
          }
        >
          <ul className="flex flex-col gap-2">
            {results.map((r) =>
              "error" in r && r.error ? (
                <li key={r.id} className="border border-l-4 border-border border-l-danger bg-card px-3.5 py-2.5 text-sm">
                  <strong>{r.name}</strong>: {r.error}
                </li>
              ) : (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={r.name}>
                      {r.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize((r as Cleaned).originalSize)} → {formatFileSize((r as Cleaned).data.length)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(r as Cleaned).removed.length === 0 ? (
                        <Badge>No metadata found</Badge>
                      ) : (
                        (r as Cleaned).removed.map((item, i) => (
                          <Badge key={i} tone="success">
                            Removed {item.name} · {formatFileSize(item.bytes)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <DownloadButton data={(r as Cleaned).data} filename={cleanName(r.name)} mime={(r as Cleaned).mime} label="Download" variant="outline" size="sm" />
                </li>
              ),
            )}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
