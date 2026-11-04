"use client";

import { useEffect, useState } from "react";
import { Download, ImageIcon } from "lucide-react";
import { Alert, Button, downloadBlob, formatFileSize } from "@toolwright/ui";
import { extractPdfImages, type ExtractedImage } from "@toolwright/core/extract-pdf-images";
import { PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { createZip } from "../../shared/zip";
import { errorMessage, pluralize } from "../../shared/format";

const PREVIEW_LIMIT = 24;

function Preview({ image }: { image: ExtractedImage }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return;
    const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image.bytes, image.mime]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab
    <img src={url} alt={`Preview of ${image.name}`} loading="lazy" decoding="async" className="h-20 w-16 shrink-0 border border-border bg-card object-contain" />
  ) : (
    <span aria-hidden className="flex h-20 w-16 shrink-0 items-center justify-center border border-border bg-muted">
      <ImageIcon className="size-6 text-muted-foreground" />
    </span>
  );
}

export default function Tool() {
  const pdf = usePdfSource();
  const job = useJob<ExtractedImage[]>();
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  function remove() {
    pdf.clear();
    job.reset();
    setZipError(null);
  }

  async function extract() {
    if (!pdf.source) return;
    setZipError(null);
    await job.run(() => extractPdfImages(pdf.source!.bytes));
  }

  async function downloadZip() {
    if (!job.result) return;
    setZipping(true);
    try {
      const entries = job.result.map((image) => ({ name: image.name, data: image.bytes }));
      const base = pdf.source?.file.name.replace(/\.pdf$/i, "") ?? "images";
      downloadBlob(createZip(entries), `${base}-images.zip`, "application/zip");
    } catch (err) {
      setZipError(errorMessage(err, "The ZIP file could not be made."));
    } finally {
      setZipping(false);
    }
  }

  const images = job.result;
  const totalBytes = images?.reduce((sum, image) => sum + image.bytes.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {!pdf.source ? <PdfDrop onFile={(f) => void pdf.load(f)} onReject={pdf.setError} loading={pdf.loading} /> : <PdfSourceCard source={pdf.source} onRemove={remove} />}
      {pdf.error ? <Alert tone="error">{pdf.error}</Alert> : null}

      {pdf.source ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <RunButton busy={job.busy} onClick={() => void extract()}>
              Extract images
            </RunButton>
            <Button variant="ghost" onClick={remove}>
              Clear
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Your PDF is scanned in this tab. Nothing is uploaded.</p>
        </>
      ) : null}

      {job.error ? <Alert tone="error">{job.error}</Alert> : null}
      {zipError ? <Alert tone="error">{zipError}</Alert> : null}

      {images ? (
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            {images.length > 1 ? (
              <Button variant="primary" size="md" disabled={zipping} onClick={() => void downloadZip()}>
                <Download aria-hidden />
                Download all as ZIP
              </Button>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {pluralize(images.length, "image")} found · {formatFileSize(totalBytes)}
            </span>
          </div>

          <ul aria-label="Extracted images" className="flex max-h-[28rem] flex-col divide-y divide-border overflow-auto border border-border bg-card">
            {images.map((image, index) => (
              <li key={image.name} className="flex items-center gap-3 p-3">
                {index < PREVIEW_LIMIT ? <Preview image={image} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{image.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {image.width} × {image.height} px · {image.mime.replace("image/", "").toUpperCase()} · {formatFileSize(image.bytes.length)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Download ${image.name}`}
                  onClick={() => downloadBlob(image.bytes, image.name, image.mime)}
                >
                  <Download aria-hidden />
                  Download
                </Button>
              </li>
            ))}
          </ul>
          {images.length > PREVIEW_LIMIT ? <p className="text-xs text-muted-foreground">Previews are shown for the first {PREVIEW_LIMIT} images only.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
