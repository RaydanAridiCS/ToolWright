"use client";

import { useState } from "react";
import { Field, Input, baseName } from "@toolwright/ui";
import { extractPages, parsePageRanges } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";

export default function Tool() {
  const pdf = usePdfSource();
  const [spec, setSpec] = useState("1-3");
  const job = useJob<{ data: Uint8Array; count: number }>();
  const source = pdf.source;

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <Field label="Pages to keep" hint={`Ranges and single pages, separated by commas: 1-3, 7, 10-. Pages come out in the order you list them. This PDF has ${source.info.pageCount} pages.`}>
              {(id) => <Input id={id} mono value={spec} onChange={(e) => (setSpec(e.target.value), job.reset())} />}
            </Field>
          </div>
          <RunButton
            busy={job.busy}
            onClick={() =>
              job.run(async () => {
                const indexes = parsePageRanges(spec, source.info.pageCount);
                return { data: await extractPages(source.bytes, indexes), count: indexes.length };
              })
            }
          >
            Extract pages
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-extract.pdf`} note={`${job.result.count} page${job.result.count === 1 ? "" : "s"}`} /> : null}
    </div>
  );
}
