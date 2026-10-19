"use client";

import { useState } from "react";
import { Field, Input, SegmentedControl, baseName } from "@toolwright/ui";
import { parsePageRanges, rotatePdf } from "@toolwright/core/pdf";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";

type Angle = "90" | "180" | "270";

export default function Tool() {
  const pdf = usePdfSource();
  const [angle, setAngle] = useState<Angle>("90");
  const [scope, setScope] = useState<"all" | "pages">("all");
  const [pages, setPages] = useState("1");
  const job = useJob<Uint8Array>();
  const source = pdf.source;

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <SegmentedControl
              label="Rotation"
              value={angle}
              onValueChange={(a) => (setAngle(a), job.reset())}
              options={[
                { value: "90", label: "90° clockwise" },
                { value: "180", label: "180°" },
                { value: "270", label: "90° counter-clockwise" },
              ]}
            />
            <SegmentedControl
              label="Pages"
              value={scope}
              onValueChange={(s) => (setScope(s), job.reset())}
              options={[
                { value: "all", label: "All pages" },
                { value: "pages", label: "Selected pages" },
              ]}
            />
            {scope === "pages" ? (
              <Field label="Pages to rotate" hint={`For example 1-3, 5, 8-. This PDF has ${source.info.pageCount} pages.`}>
                {(id) => <Input id={id} mono value={pages} onChange={(e) => setPages(e.target.value)} />}
              </Field>
            ) : null}
          </div>
          <RunButton
            busy={job.busy}
            onClick={() => job.run(() => rotatePdf(source.bytes, Number(angle) as 90 | 180 | 270, scope === "pages" ? parsePageRanges(pages, source.info.pageCount) : undefined))}
          >
            Rotate PDF
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-rotated.pdf`} /> : null}
    </div>
  );
}
