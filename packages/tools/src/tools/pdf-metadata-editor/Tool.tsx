"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Panel, baseName } from "@toolwright/ui";
import { setPdfMetadata, stripPdfMetadata } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";

const FIELDS = ["title", "author", "subject", "keywords", "creator", "producer"] as const;
type FieldKey = (typeof FIELDS)[number];

export default function Tool() {
  const pdf = usePdfSource();
  const [values, setValues] = useState<Record<FieldKey, string>>({ title: "", author: "", subject: "", keywords: "", creator: "", producer: "" });
  const job = useJob<{ data: Uint8Array; label: string }>();
  const source = pdf.source;

  useEffect(() => {
    if (!source) return;
    const i = source.info;
    setValues({ title: i.title ?? "", author: i.author ?? "", subject: i.subject ?? "", keywords: i.keywords ?? "", creator: i.creator ?? "", producer: i.producer ?? "" });
  }, [source]);

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
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
            <RunButton busy={job.busy} onClick={() => job.run(async () => ({ data: await setPdfMetadata(source.bytes, values), label: "edited" }))}>
              Save changes
            </RunButton>
            <Button variant="outline" size="lg" disabled={job.busy} onClick={() => job.run(async () => ({ data: await stripPdfMetadata(source.bytes), label: "clean" }))}>
              Remove all metadata
            </Button>
          </div>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-${job.result.label}.pdf`} /> : null}
    </div>
  );
}
