"use client";

import { useEffect, useState } from "react";
import { Alert, Toggle } from "@toolwright/ui";
import { COMMENT_KINDS, flattenPdf, inspectFlatten, type FlattenReport } from "@toolwright/core/pdf-flatten";
import { DownloadResult, JobError, PdfBatchDrop, PdfLoadStatus, PdfSourceList, RunButton, runOnAll, useJob, usePdfSource, type BatchOutput, type PdfSource } from "../../shared/pdf-ui";
import { errorMessage } from "../../shared/format";

const SINGULAR: Record<string, string> = { highlights: "highlight", notes: "note", "text boxes": "text box", stamps: "stamp", drawings: "drawing", shapes: "shape", "attached files": "attached file", "other marks": "other mark" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Flattened extends BatchOutput {
  fields: number;
  comments: number;
  withoutPicture: number;
  links: number;
  /** For a single file: what is left in the new file, read back from it. */
  after: FlattenReport | null;
}

/** Reads every file's report; a file that cannot be read shows its message instead. */
function useReports(sources: PdfSource[]) {
  const [reports, setReports] = useState<Map<PdfSource, FlattenReport | string>>(() => new Map());
  useEffect(() => {
    let live = true;
    for (const s of sources) {
      if (reports.has(s)) continue;
      inspectFlatten(s.bytes).then(
        (r) => live && setReports((m) => new Map(m).set(s, r)),
        (err) => live && setReports((m) => new Map(m).set(s, errorMessage(err))),
      );
    }
    return () => {
      live = false;
    };
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps -- a report is read once per file
  return reports;
}

function describeComments(r: FlattenReport): string {
  const parts = COMMENT_KINDS.flatMap((k) => {
    const n = r.comments[k];
    return n ? [`${n} ${n === 1 ? (SINGULAR[k] ?? k) : k}`] : [];
  });
  return parts.join(", ");
}

function Summary({ report }: { report: FlattenReport }) {
  const rows: [string, string][] = [
    ["Form fields", report.fields ? `${report.fields} (${report.filledFields} filled in)` : "None"],
    ["Comments and marks", report.commentTotal ? `${report.commentTotal}: ${describeComments(report)}` : "None"],
    ["Links", report.links ? String(report.links) : "None"],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Tool() {
  const pdf = usePdfSource();
  const [forms, setForms] = useState(true);
  const [comments, setComments] = useState(true);
  const [removeLinks, setRemoveLinks] = useState(false);
  const job = useJob<Flattened>();
  const reports = useReports(pdf.all);
  const source = pdf.source;

  const known = pdf.all.map((s) => reports.get(s)).filter((r): r is FlattenReport => typeof r === "object");
  const total = (pick: (r: FlattenReport) => number) => known.reduce((sum, r) => sum + pick(r), 0);
  const fieldTotal = total((r) => r.fields);
  const commentTotal = total((r) => r.commentTotal);
  const signed = total((r) => r.signed);
  const xfa = known.some((r) => r.xfa);
  const allRead = known.length === pdf.all.length;
  const nothing = allRead && fieldTotal === 0 && commentTotal === 0;
  const nothingChosen = !forms && !comments && !removeLinks;

  const run = () =>
    job.run(async () => {
      const counts = { fields: 0, comments: 0, withoutPicture: 0, links: 0 };
      const made: { last?: Uint8Array } = {};
      const out = await runOnAll(pdf.all, "flattened", async (s) => {
        const r = await flattenPdf(s.bytes, { forms, comments, removeLinks });
        counts.fields += r.fields;
        counts.comments += r.comments;
        counts.withoutPicture += r.withoutPicture;
        counts.links += r.links;
        made.last = r.data;
        return r.data;
      });
      const after = pdf.all.length === 1 && made.last ? await inspectFlatten(made.last) : null;
      return { ...out, ...counts, after };
    });

  const set = (fn: (v: boolean) => void) => (v: boolean) => (fn(v), job.reset());
  const result = job.result;

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceList sources={pdf.all} onRemove={(i) => (pdf.remove(i), job.reset())} /> : null}
      <PdfBatchDrop more={Boolean(source)} onFiles={(files) => (job.reset(), void pdf.loadMany(files))} onReject={pdf.setError} loading={pdf.loading} />
      <PdfLoadStatus pdf={pdf} />

      {source ? (
        <>
          <section aria-label="What the PDF has" className="flex flex-col gap-3 border border-border bg-card p-4">
            <p className="label-plate">{pdf.all.length === 1 ? "In this PDF" : `In these ${pdf.all.length} PDFs`}</p>
            {pdf.all.length === 1 ? (
              (() => {
                const r = reports.get(source);
                if (!r) return <p className="text-sm text-muted-foreground">Reading the PDF…</p>;
                if (typeof r === "string") return <Alert tone="error">{r}</Alert>;
                return <Summary report={r} />;
              })()
            ) : allRead ? (
              <p className="text-sm">
                {plural(fieldTotal, "form field")} and {plural(commentTotal, "comment or mark", "comments and marks")} in all.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Reading the PDFs…</p>
            )}
          </section>

          {nothing ? <Alert tone="info">There are no form fields or comments to flatten. The file already looks the same everywhere.</Alert> : null}
          {signed ? (
            <Alert tone="warning">
              {pdf.all.length === 1 ? "This PDF is" : "Some of these PDFs are"} digitally signed. Flattening changes the file, so the signature can no longer be checked. Its picture stays on the page, but it is no longer proof of who signed.
            </Alert>
          ) : null}
          {xfa && forms ? <Alert tone="info">This form also has an XFA version, which some readers show instead of the normal fields. Flattening removes it, and keeps what the normal fields show.</Alert> : null}

          <div className="flex flex-col gap-3 border border-border bg-card p-4">
            <p className="label-plate">Flatten</p>
            <Toggle label="Form fields" hint="Typed answers, ticks and choices become part of the page and can no longer be changed." checked={forms} onCheckedChange={set(setForms)} />
            <Toggle label="Comments, highlights, stamps and drawings" hint="They stay where they are, as part of the page. Pop-up note text is not printed on the page." checked={comments} onCheckedChange={set(setComments)} />
            <Toggle label="Remove links" hint="Links are invisible, so there is nothing to flatten. Off keeps them clickable." checked={removeLinks} onCheckedChange={set(setRemoveLinks)} />
          </div>

          {nothingChosen ? <Alert tone="warning">Choose at least one thing to flatten.</Alert> : null}
          <RunButton busy={job.busy} disabled={nothingChosen} onClick={run}>
            {pdf.all.length > 1 ? `Flatten ${pdf.all.length} PDFs` : "Flatten PDF"}
          </RunButton>
          <p className="-mt-3 text-sm text-muted-foreground">Flattening keeps what you see. It does not hide anything: to black out private details for good, use Redact PDF.</p>
        </>
      ) : null}

      <JobError error={job.error} />
      {result ? (
        <div className="flex flex-col gap-3">
          <DownloadResult
            data={result.data}
            filename={result.filename}
            mime={result.mime}
            note={[result.fields ? plural(result.fields, "field") : null, result.comments ? plural(result.comments, "comment") : null, result.links ? `${plural(result.links, "link")} removed` : null].filter(Boolean).join(", ") || "Nothing needed flattening"}
          />
          {result.after ? (
            <p className="text-sm" aria-live="polite">
              Checked the new file: {plural(result.after.fields, "fillable field")}, {plural(result.after.commentTotal, "comment")} and {plural(result.after.links, "link")} left.
            </p>
          ) : null}
          {result.withoutPicture ? (
            <Alert tone="info">
              {plural(result.withoutPicture, "comment")} had no picture of its own (a reader draws its own icon for it), so {result.withoutPicture === 1 ? "it was" : "they were"} removed rather than drawn.
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
