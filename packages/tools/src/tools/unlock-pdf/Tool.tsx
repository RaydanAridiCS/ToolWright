"use client";

import { useState } from "react";
import { Alert, FileDropzone, FileListItem } from "@toolwright/ui";
import { isPdf } from "@toolwright/core/pdf";
import { decryptPdf, PdfPasswordError, readPdfSecurity, type PdfSecurity } from "@toolwright/core/pdf-crypto";
import { DownloadResult, JobError, RunButton, runOnAll, useJob, type BatchOutput } from "../../shared/pdf-ui";
import { PasswordField } from "../../shared/password-field";
import { errorMessage } from "../../shared/format";

interface Item {
  id: number;
  file: File;
  bytes: Uint8Array;
  security: PdfSecurity | null;
}

let nextId = 1;

/** "AES-256 · needs a password" or "RC4 128-bit · no printing, no copying". */
function describe(security: PdfSecurity | null): string {
  if (!security) return "Not protected";
  if (security.needsPassword) return `${security.method} · needs a password`;
  const blocked = [!security.permissions.print && "printing", !security.permissions.copy && "copying", !security.permissions.modify && "editing", !security.permissions.annotate && "comments"].filter(Boolean);
  return `${security.method} · ${blocked.length ? `blocks ${blocked.join(", ")}` : "owner password only"}`;
}

export default function Tool() {
  const [items, setItems] = useState<Item[]>([]);
  const [password, setPassword] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const job = useJob<BatchOutput>();

  const add = async (files: File[]) => {
    job.reset();
    setLoadError(null);
    setLoading(true);
    const added: Item[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isPdf(bytes)) throw new Error(`${file.name} does not look like a PDF file.`);
        added.push({ id: nextId++, file, bytes, security: await readPdfSecurity(bytes) });
      } catch (err) {
        problems.push(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setItems((current) => [...current, ...added]);
    if (problems.length) setLoadError(problems.join(" "));
    setLoading(false);
  };

  const protectedItems = items.filter((i) => i.security);
  const plain = items.filter((i) => !i.security);
  const needsPassword = protectedItems.some((i) => i.security?.needsPassword);
  const canRun = protectedItems.length > 0 && (!needsPassword || password.length > 0);

  const run = () => {
    if (!canRun) return;
    job.run(async () => {
      try {
        return await runOnAll(protectedItems, "unlocked", (item) => decryptPdf(item.bytes, item.security?.needsPassword ? password : ""));
      } catch (err) {
        // runOnAll prefixes the file name in a batch, so match on the message too.
        if (err instanceof PdfPasswordError || /does not open this PDF/.test(errorMessage(err))) throw new Error(`${errorMessage(err)} Check the password and try again.`);
        throw err;
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {items.length ? (
        <ul aria-label="PDFs to unlock" className="flex flex-col gap-2">
          {items.map((item) => (
            <FileListItem key={item.id} name={item.file.name} size={item.file.size} detail={describe(item.security)} onRemove={() => (job.reset(), setItems((c) => c.filter((x) => x.id !== item.id)))} />
          ))}
        </ul>
      ) : null}
      <FileDropzone
        accept=".pdf,application/pdf"
        multiple
        label={loading ? "Reading PDFs…" : items.length ? "Add more PDFs" : "Drop a protected PDF here, or click to browse"}
        hint="Your PDF and password stay in this tab. Nothing is uploaded."
        disabled={loading}
        onReject={setLoadError}
        onFiles={(files) => void add(files)}
      />
      {loadError ? <Alert tone="error">{loadError}</Alert> : null}
      {plain.length ? (
        <Alert tone="info">
          {plain.length === 1 ? `${plain[0]!.file.name} has` : `${plain.length} files have`} no password or restrictions, so there is nothing to remove{protectedItems.length ? "; they are left out" : ""}.
        </Alert>
      ) : null}

      {protectedItems.length ? (
        <>
          {needsPassword ? (
            <div className="flex flex-col gap-2 border border-border bg-card p-4">
              <PasswordField label="Password" value={password} onChange={(v) => (setPassword(v), job.reset())} onEnter={run} autoComplete="current-password" hint="The password that opens the file, or its owner password." />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">These files open without a password. Unlocking saves a copy without their restrictions. Only do this with files you are allowed to change.</p>
          )}
          <RunButton busy={job.busy} disabled={!canRun} onClick={run}>
            {protectedItems.length > 1 ? `Unlock ${protectedItems.length} PDFs` : "Unlock PDF"}
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? <DownloadResult {...job.result} /> : null}
    </div>
  );
}
