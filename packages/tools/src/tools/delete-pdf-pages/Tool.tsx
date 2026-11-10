"use client";

import { useMemo, useState } from "react";
import { Field, Input, baseName } from "@toolwright/ui";
import { deletePages, formatPageRanges, parsePageRanges } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { PdfPageSelector } from "../../shared/pdf-page-selector";

export default function Tool() {
  const pdf = usePdfSource();
  const [spec, setSpec] = useState("2");
  const job = useJob<{ data: Uint8Array; kept: number }>();
  const source = pdf.source;

  const selectedIndexes = useMemo(() => {
    if (!source) return [];
    try {
      return parsePageRanges(spec, source.info.pageCount);
    } catch {
      return [];
    }
  }, [spec, source]);

  const handleSelectionChange = (newIndexes: number[]) => {
    setSpec(formatPageRanges(newIndexes));
    job.reset();
  };

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <Field label="Pages to delete" hint={`For example 2, 5-7, 12-. Click pages below to mark them for removal, or type above. This PDF has ${source.info.pageCount} pages.`}>
              {(id) => <Input id={id} mono value={spec} onChange={(e) => (setSpec(e.target.value), job.reset())} />}
            </Field>

            <PdfPageSelector
              file={source.file}
              pageCount={source.info.pageCount}
              selectedIndexes={selectedIndexes}
              onSelectionChange={handleSelectionChange}
              mode="delete"
            />
          </div>
          <RunButton
            busy={job.busy}
            onClick={() =>
              job.run(async () => {
                const indexes = parsePageRanges(spec, source.info.pageCount);
                const data = await deletePages(source.bytes, indexes);
                return { data, kept: source.info.pageCount - new Set(indexes).size };
              })
            }
          >
            Delete pages
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result.data} filename={`${baseName(source.file.name)}-edited.pdf`} note={`${job.result.kept} page${job.result.kept === 1 ? "" : "s"} left`} /> : null}
    </div>
  );
}
