"use client";

import { useState } from "react";
import { Alert, DownloadButton, Field, FileListItem, Input, SegmentedControl, baseName } from "@toolwright/ui";
import { splitPdf, type SplitMode, type SplitPart } from "@toolwright/core/pdf";
import { JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";
import { createZip } from "../../shared/zip";

type Kind = "each" | "every" | "ranges";

export default function Tool() {
  const pdf = usePdfSource();
  const [kind, setKind] = useState<Kind>("each");
  const [every, setEvery] = useState("2");
  const [ranges, setRanges] = useState("1-2; 3-4");
  const job = useJob<SplitPart[]>();

  const source = pdf.source;
  const mode = (): SplitMode => (kind === "each" ? { type: "each" } : kind === "every" ? { type: "every", pages: num(every) } : { type: "ranges", spec: ranges });

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <SegmentedControl
              label="Split mode"
              value={kind}
              onValueChange={(k) => (setKind(k), job.reset())}
              options={[
                { value: "each", label: "Every page" },
                { value: "every", label: "Every N pages" },
                { value: "ranges", label: "Custom ranges" },
              ]}
            />
            {kind === "every" ? <NumberField label="Pages per file" value={every} onChange={setEvery} min={1} step={1} className="max-w-48" /> : null}
            {kind === "ranges" ? (
              <Field label="Page ranges" hint={`Separate files with semicolons. Example: 1-3; 4; 5-${source.info.pageCount}. The PDF has ${source.info.pageCount} pages.`}>
                {(id) => <Input id={id} mono value={ranges} onChange={(e) => setRanges(e.target.value)} />}
              </Field>
            ) : null}
          </div>
          <RunButton busy={job.busy} onClick={() => job.run(() => splitPdf(source.bytes, mode(), baseName(source.file.name)))}>
            Split PDF
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />

      {job.result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-l-4 border-foreground border-l-success bg-card p-4 shadow-md">
            <p className="font-medium">Created {job.result.length} file{job.result.length === 1 ? "" : "s"}.</p>
            <DownloadButton
              data={createZip(job.result.map((p) => ({ name: p.name, data: p.data })))}
              filename={`${baseName(source?.file.name ?? "split")}-split.zip`}
              mime="application/zip"
              label="Download all (ZIP)"
              variant="primary"
              size="md"
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {job.result.map((part) => (
              <FileListItem key={part.name} name={part.name} size={part.data.length} detail={part.pages.length === 1 ? `page ${part.pages[0]}` : `pages ${part.pages[0]}–${part.pages[part.pages.length - 1]}`}>
                <DownloadButton data={part.data} filename={part.name} mime="application/pdf" label="" aria-label={`Download ${part.name}`} variant="ghost" size="sm" />
              </FileListItem>
            ))}
          </ul>
        </div>
      ) : null}
      {!source && !pdf.error ? <Alert tone="info">Drop a PDF to choose how to split it.</Alert> : null}
    </div>
  );
}
