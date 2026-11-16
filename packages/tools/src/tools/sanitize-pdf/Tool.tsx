"use client";

import { useEffect, useState } from "react";
import { Alert, Toggle } from "@toolwright/ui";
import { inspectSanitize, sanitizePdf, type SanitizeFindings, type SanitizeOptions } from "@toolwright/core/pdf-sanitize";
import { DownloadResult, JobError, PdfBatchDrop, PdfLoadStatus, PdfSourceList, RunButton, runOnAll, useJob, usePdfSource, type BatchOutput, type PdfSource } from "../../shared/pdf-ui";
import { errorMessage } from "../../shared/format";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Key = keyof Required<SanitizeOptions>;

/** Plain names for the standard document details. */
const INFO_NAMES: Record<string, string> = { Title: "title", Author: "author", Subject: "subject", Keywords: "keywords", Creator: "app that made it", Producer: "PDF software", CreationDate: "date made", ModDate: "date changed", Trapped: "print trapping" };

const metadataCount = (f: SanitizeFindings) => f.info.length + f.xmp + f.privateData + f.photosWithData + (f.fileId ? 1 : 0);

const ROWS: { key: Key; label: string; hint: string; found: (f: SanitizeFindings) => number; detail?: (f: SanitizeFindings) => string; on: boolean }[] = [
  { key: "scripts", label: "Scripts", hint: "JavaScript that runs when the file opens, a page shows or a field changes.", found: (f) => f.scripts, on: true },
  { key: "actions", label: "Risky actions", hint: "Actions that start programs, open other files, send form data or play media.", found: (f) => f.actions, on: true },
  { key: "attachments", label: "Attached files", hint: "Files carried inside the PDF.", found: (f) => f.attachments, detail: (f) => f.attachmentNames.join(", "), on: true },
  {
    key: "metadata",
    label: "Metadata",
    hint: "Document details, XMP, applications' private data, camera data in photos and the file ID.",
    found: metadataCount,
    detail: (f) =>
      [f.info.length ? f.info.map((k) => INFO_NAMES[k] ?? k).join(", ") : null, f.xmp ? `XMP in ${plural(f.xmp, "place")}` : null, f.privateData ? `private data from ${plural(f.privateData, "application")}` : null, f.photosWithData ? `${plural(f.photosWithData, "photo")} with camera data` : null, f.fileId ? "file ID" : null]
        .filter(Boolean)
        .join(", "),
    on: true,
  },
  { key: "hiddenLayers", label: "Content on hidden layers", hint: "Layers that are switched off when the file opens can still hold text and pictures.", found: (f) => f.hiddenLayers, on: true },
  { key: "comments", label: "Comments and marks", hint: "Notes, highlights, stamps and drawings. They are visible, so they stay unless you choose.", found: (f) => f.comments, on: false },
  { key: "forms", label: "Form fields", hint: "Flattened first, so the answers stay on the page.", found: (f) => f.formFields, on: false },
  { key: "webLinks", label: "Links to websites", hint: "Links within the document always stay.", found: (f) => f.webLinks, on: false },
];

const sum = (list: SanitizeFindings[], pick: (f: SanitizeFindings) => number) => list.reduce((n, f) => n + pick(f), 0);

/** Each file's findings; a file that cannot be read shows its message. */
function useFindings(sources: PdfSource[]) {
  const [found, setFound] = useState<Map<PdfSource, SanitizeFindings | string>>(() => new Map());
  useEffect(() => {
    let live = true;
    for (const s of sources) {
      if (found.has(s)) continue;
      inspectSanitize(s.bytes).then(
        (f) => live && setFound((m) => new Map(m).set(s, f)),
        (err) => live && setFound((m) => new Map(m).set(s, errorMessage(err))),
      );
    }
    return () => {
      live = false;
    };
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps -- each file is read once
  return found;
}

interface Cleaned extends BatchOutput {
  earlierVersions: number;
  hiddenContent: number;
  /** For one file: what the new file still has, read back from it. */
  after: SanitizeFindings | null;
}

export default function Tool() {
  const pdf = usePdfSource();
  const [choice, setChoice] = useState<Record<Key, boolean>>(() => Object.fromEntries(ROWS.map((r) => [r.key, r.on])) as Record<Key, boolean>);
  const job = useJob<Cleaned>();
  const found = useFindings(pdf.all);
  const source = pdf.source;

  const known = pdf.all.map((s) => found.get(s)).filter((f): f is SanitizeFindings => typeof f === "object");
  const failed = pdf.all.flatMap((s) => (typeof found.get(s) === "string" ? [`${s.file.name}: ${found.get(s) as string}`] : []));
  const allRead = known.length + failed.length === pdf.all.length;
  const single = pdf.all.length === 1 ? known[0] : undefined;
  const earlier = sum(known, (f) => f.earlierVersions);
  const nothingChosen = !Object.values(choice).some(Boolean);

  const run = () =>
    job.run(async () => {
      let earlierVersions = 0;
      let hiddenContent = 0;
      const made: { last?: Uint8Array } = {};
      const out = await runOnAll(pdf.all, "clean", async (s) => {
        const r = await sanitizePdf(s.bytes, choice);
        earlierVersions += r.removed.earlierVersions ?? 0;
        hiddenContent += r.hiddenContent;
        made.last = r.data;
        return r.data;
      });
      const after = pdf.all.length === 1 && made.last ? await inspectSanitize(made.last) : null;
      return { ...out, earlierVersions, hiddenContent, after };
    });

  const result = job.result;
  const left = result?.after ? ROWS.filter((r) => choice[r.key] && r.found(result.after as SanitizeFindings) > 0) : [];

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceList sources={pdf.all} onRemove={(i) => (pdf.remove(i), job.reset())} /> : null}
      <PdfBatchDrop more={Boolean(source)} onFiles={(files) => (job.reset(), void pdf.loadMany(files))} onReject={pdf.setError} loading={pdf.loading} />
      <PdfLoadStatus pdf={pdf} />

      {source ? (
        <>
          {failed.length ? <Alert tone="error">{failed.join(" ")}</Alert> : null}
          <section aria-label="What to remove" className="flex flex-col border border-border bg-card">
            <p className="label-plate border-b border-border px-4 py-3">{pdf.all.length === 1 ? "Found in this PDF" : `Found in these ${pdf.all.length} PDFs`}</p>
            <ul className="flex flex-col divide-y divide-border">
              {ROWS.map((row) => {
                const count = allRead ? sum(known, row.found) : null;
                const detail = single && row.detail && count ? row.detail(single) : "";
                return (
                  <li key={row.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <Toggle label={row.label} hint={row.hint} checked={choice[row.key]} onCheckedChange={(v) => (setChoice((c) => ({ ...c, [row.key]: v })), job.reset())} className="min-w-0 flex-1 basis-64" />
                    <p className="ml-12 font-mono text-xs sm:ml-0 sm:text-right" aria-label={`${row.label}: ${count === null ? "checking" : count ? `${count} found` : "none found"}`}>
                      {count === null ? (
                        <span className="text-muted-foreground">Checking…</span>
                      ) : count ? (
                        <span className="bg-marker px-1.5 py-0.5 font-semibold text-marker-foreground">{count} found</span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                      {detail ? <span className="mt-1 block max-w-80 break-words font-sans text-muted-foreground">{detail}</span> : null}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Always left out: earlier saved versions inside the file{allRead && earlier ? ` (${earlier} found)` : ""}, page thumbnails, and data nothing uses any more.
            </p>
          </section>

          {nothingChosen ? <Alert tone="warning">Choose at least one thing to remove.</Alert> : null}
          <RunButton busy={job.busy} disabled={nothingChosen} onClick={run}>
            {pdf.all.length > 1 ? `Clean ${pdf.all.length} PDFs` : "Clean PDF"}
          </RunButton>
          <p className="-mt-3 text-sm text-muted-foreground">The pages look the same afterwards. To black out words that show on the page, use Redact PDF.</p>
        </>
      ) : null}

      <JobError error={job.error} />
      {result ? (
        <div className="flex flex-col gap-3">
          <DownloadResult data={result.data} filename={result.filename} mime={result.mime} note={result.note ?? (result.earlierVersions ? `${plural(result.earlierVersions, "earlier version")} left out` : undefined)} />
          {result.after ? (
            <p className="text-sm" aria-live="polite">
              {left.length === 0 ? "Checked the new file: nothing you chose to remove is left." : `Checked the new file: still found ${left.map((r) => r.label.toLowerCase()).join(", ")}.`}
              {result.hiddenContent ? ` ${plural(result.hiddenContent, "drawing step")} on hidden layers taken out.` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
