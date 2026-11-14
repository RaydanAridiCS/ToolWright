"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Panel } from "@toolwright/ui";
import { setPdfMetadata, stripPdfMetadata } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfBatchDrop, PdfSourceList, RunButton, runOnAll, useJob, usePdfSource, type BatchOutput } from "../../shared/pdf-ui";

const FIELDS = ["title", "author", "subject", "keywords", "creator", "producer"] as const;
type FieldKey = (typeof FIELDS)[number];

export default function Tool() {
  const pdf = usePdfSource();
  const [values, setValues] = useState<Record<FieldKey, string>>({ title: "", author: "", subject: "", keywords: "", creator: "", producer: "" });
  const job = useJob<BatchOutput>();
  const batch = pdf.all.length > 1;
  const source = pdf.source;

  useEffect(() => {
    if (!source) return;
    const i = source.info;
    setValues({ title: i.title ?? "", author: i.author ?? "", subject: i.subject ?? "", keywords: i.keywords ?? "", creator: i.creator ?? "", producer: i.producer ?? "" });
  }, [source]);

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceList sources={pdf.all} onRemove={(i) => (pdf.remove(i), job.reset())} /> : null}
      <PdfBatchDrop more={Boolean(source)} onFiles={(files) => (job.reset(), void pdf.loadMany(files))} onReject={pdf.setError} loading={pdf.loading} />
      <JobError error={pdf.error} />

      {source && batch ? (
        <>
          <p className="text-sm text-muted-foreground">With several files you can clean them all at once. To edit the title or author, keep one file in the list.</p>
          <RunButton busy={job.busy} onClick={() => job.run(() => runOnAll(pdf.all, "clean", (s) => stripPdfMetadata(s.bytes)))}>
            Remove all metadata from {pdf.all.length} PDFs
          </RunButton>
        </>
      ) : null}

      {source && !batch ? (
        <>
          <Panel title="Document properties">
            <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
              {FIELDS.map((key) => (
                <Field key={key} label={key[0]?.toUpperCase() + key.slice(1)}>
                  {(id) => <Input id={id} value={values[key]} onChange={(e) => (setValues((v) => ({ ...v, [key]: e.target.value })), job.reset())} />}
                </Field>
              ))}
              <Field label="Created">{(id) => <Input id={id} readOnly value={source.info.creationDate ?? "—"} />}</Field>
              <Field label="Modified">{(id) => <Input id={id} readOnly value={source.info.modificationDate ?? "—"} />}</Field>
            </div>
          </Panel>
          <div className="flex flex-wrap items-center gap-3">
            <RunButton busy={job.busy} onClick={() => job.run(() => runOnAll([source], "edited", (s) => setPdfMetadata(s.bytes, values)))}>
              Save changes
            </RunButton>
            <Button variant="outline" size="lg" disabled={job.busy} onClick={() => job.run(() => runOnAll([source], "clean", (s) => stripPdfMetadata(s.bytes)))}>
              Remove all metadata
            </Button>
          </div>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? <DownloadResult {...job.result} /> : null}
    </div>
  );
}
