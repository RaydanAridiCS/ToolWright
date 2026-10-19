"use client";

import { useState } from "react";
import { Field, Select, baseName } from "@toolwright/ui";
import { addPageNumbers, type PageNumberOptions } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";

export default function Tool() {
  const pdf = usePdfSource();
  const [position, setPosition] = useState<NonNullable<PageNumberOptions["position"]>>("bottom-center");
  const [format, setFormat] = useState<NonNullable<PageNumberOptions["format"]>>("n");
  const [startAt, setStartAt] = useState("1");
  const [fontSize, setFontSize] = useState("10");
  const job = useJob<Uint8Array>();
  const source = pdf.source;

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Position">
              {(id) => (
                <Select id={id} value={position} onChange={(e) => (setPosition(e.target.value as typeof position), job.reset())}>
                  <option value="bottom-center">Bottom center</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="top-center">Top center</option>
                  <option value="top-right">Top right</option>
                  <option value="top-left">Top left</option>
                </Select>
              )}
            </Field>
            <Field label="Format">
              {(id) => (
                <Select id={id} value={format} onChange={(e) => (setFormat(e.target.value as typeof format), job.reset())}>
                  <option value="n">1, 2, 3</option>
                  <option value="n-of-total">1 of N</option>
                  <option value="page-n">Page 1</option>
                </Select>
              )}
            </Field>
            <NumberField label="Start at" value={startAt} onChange={setStartAt} min={0} step={1} />
            <NumberField label="Font size" suffix="pt" value={fontSize} onChange={setFontSize} min={6} max={48} />
          </div>
          <RunButton busy={job.busy} onClick={() => job.run(() => addPageNumbers(source.bytes, { position, format, startAt: Math.floor(num(startAt)) || 1, fontSize: num(fontSize) || 10 }))}>
            Add page numbers
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-numbered.pdf`} /> : null}
    </div>
  );
}
