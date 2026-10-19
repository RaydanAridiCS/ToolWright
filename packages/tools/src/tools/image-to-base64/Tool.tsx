"use client";

import { useMemo, useState } from "react";
import { Alert, DownloadButton, FileDropzone, FileListItem, Panel, SegmentedControl, Textarea, formatFileSize } from "@toolwright/ui";
import { base64ToBytes } from "@toolwright/core/encoding";
import { detectImageKind } from "@toolwright/core/image-meta";
import { blobToDataUrl } from "../../shared/image";
import { ResultRow } from "../../shared/result-row";
import { errorMessage } from "../../shared/format";

type Mode = "encode" | "decode";

export default function Tool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const decoded = useMemo(() => {
    const text = input.trim();
    if (!text) return null;
    try {
      const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(text);
      const payload = match ? (match[2] as string) : text;
      const bytes = base64ToBytes(payload);
      const kind = detectImageKind(bytes);
      const mime = match?.[1] || (kind === "jpeg" ? "image/jpeg" : kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : kind === "gif" ? "image/gif" : kind === "bmp" ? "image/bmp" : text.includes("<svg") ? "image/svg+xml" : null);
      if (!mime || !mime.startsWith("image/")) throw new Error("This Base64 does not appear to be an image.");
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "img";
      return { ok: true as const, bytes, mime, url: `data:${mime};base64,${payload.replace(/\s+/g, "")}`, ext };
    } catch (err) {
      return { ok: false as const, error: errorMessage(err) };
    }
  }, [input]);

  const raw = dataUrl.split(",")[1] ?? "";

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label="Direction"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "encode", label: "Image → Base64" },
          { value: "decode", label: "Base64 → Image" },
        ]}
      />

      {mode === "encode" ? (
        <>
          {file ? (
            <ul>
              <FileListItem name={file.name} size={file.size} onRemove={() => (setFile(null), setDataUrl(""))} />
            </ul>
          ) : (
            <FileDropzone
              accept="image/*"
              label="Drop an image here, or click to browse"
              onReject={setError}
              onFiles={async ([f]) => {
                if (!f) return;
                setError(null);
                try {
                  setDataUrl(await blobToDataUrl(f));
                  setFile(f);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            />
          )}
          {error ? <Alert tone="error">{error}</Alert> : null}
          {dataUrl ? (
            <>
              {dataUrl.length > 150_000 ? <Alert tone="warning">This data URI is {formatFileSize(dataUrl.length)}. Inlining large images slows pages down, so consider compressing the image first.</Alert> : null}
              <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt="Preview" className="max-h-32 max-w-48 rounded border border-border object-contain" />
                <p className="text-sm text-muted-foreground">
                  Base64 adds about 33% to the file size: {formatFileSize(file?.size ?? 0)} → {formatFileSize(dataUrl.length)}.
                </p>
              </div>
              <Panel title="Ready-to-use snippets">
                <div className="grid gap-3">
                  <ResultRow label="Data URI" value={dataUrl} />
                  <ResultRow label="Raw Base64" value={raw} />
                  <ResultRow label="HTML" value={`<img src="${dataUrl}" alt="">`} />
                  <ResultRow label="CSS" value={`background-image: url("${dataUrl}");`} />
                  <ResultRow label="Markdown" value={`![](${dataUrl})`} />
                </div>
              </Panel>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Panel title="Base64 or data URI">
            <Textarea aria-label="Base64 or data URI" rows={8} value={input} onChange={(e) => setInput(e.target.value)} placeholder="data:image/png;base64,iVBORw0KGgo…" className="break-all" />
          </Panel>
          {decoded && !decoded.ok ? <Alert tone="error">{decoded.error}</Alert> : null}
          {decoded?.ok ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={decoded.url} alt="Decoded preview" className="max-h-56 max-w-full rounded border border-border object-contain" />
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {decoded.mime} · {formatFileSize(decoded.bytes.length)}
                </p>
                <DownloadButton data={decoded.bytes} filename={`image.${decoded.ext}`} mime={decoded.mime} label="Download image" variant="primary" size="md" />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
