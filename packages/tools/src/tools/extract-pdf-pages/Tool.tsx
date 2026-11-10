"use client";

import { useMemo, useState } from "react";
import { Field, Input, baseName } from "@toolwright/ui";
import { extractPages, formatPageRanges, parsePageRanges } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { PdfPageSelector } from "../../shared/pdf-page-selector";

export default function Tool() {
  const pdf = usePdfSource();
  const [spec, setSpec] = useState("1-3");
  const job = useJob<{ data: Uint8Array; count: number }>();
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
            <Field label="Pages to keep" hint={`Ranges and single pages, separated by commas: 1-3, 7, 10-. Click pages below or type above. This PDF has ${source.info.pageCount} pages.`}>
              {(id) => <Input id={id} mono value={spec} onChange={(e) => (setSpec(e.target.value), job.reset())} />}
            </Field>

            <PdfPageSelector
              file={source.file}
              pageCount={source.info.pageCount}
              selectedIndexes={selectedIndexes}
              onSelectionChange={handleSelectionChange}
              mode="keep"
            />
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
