"use client";

import { useState } from "react";
import { Alert, CopyButton, Toggle } from "@toolwright/ui";
import { ALL_PERMISSIONS, encryptPdf, randomOwnerPassword, type PdfPermissions } from "@toolwright/core/pdf-crypto";
import { DownloadResult, JobError, PdfBatchDrop, PdfLoadStatus, PdfSourceList, RunButton, runOnAll, useJob, usePdfSource, type BatchOutput } from "../../shared/pdf-ui";
import { PasswordField } from "../../shared/password-field";

const PERMISSION_LABELS: { key: keyof PdfPermissions; label: string; hint: string }[] = [
  { key: "print", label: "Allow printing", hint: "Off stops readers that respect the setting from printing." },
  { key: "copy", label: "Allow copying text and images", hint: "Off greys out select and copy." },
  { key: "modify", label: "Allow changing pages", hint: "Editing, inserting, deleting and rotating pages." },
  { key: "annotate", label: "Allow comments and form filling", hint: "Adding notes and highlights, and filling in form fields." },
];

interface Protected extends BatchOutput {
  ownerPassword: string;
  madeOwner: boolean;
  restricted: boolean;
}

export default function Tool() {
  const pdf = usePdfSource();
  const [password, setPassword] = useState("");
  const [restrict, setRestrict] = useState(false);
  const [permissions, setPermissions] = useState<PdfPermissions>(ALL_PERMISSIONS);
  const [owner, setOwner] = useState("");
  const job = useJob<Protected>();
  const source = pdf.source;

  const effective = restrict ? permissions : ALL_PERMISSIONS;
  const restricted = Object.values(effective).some((allowed) => !allowed);
  const problem = !password && !restricted ? "Type a password, or turn on restrictions and switch off at least one permission." : restricted && owner && owner === password ? "Use a different owner password, or anyone who can open the file could lift the restrictions." : null;

  const run = () => {
    if (problem) return;
    job.run(async () => {
      // One owner password for the whole batch, so a single note covers every file.
      const ownerPassword = owner || randomOwnerPassword();
      const out = await runOnAll(pdf.all, "protected", async (s) => (await encryptPdf(s.bytes, { userPassword: password, ownerPassword, permissions: effective })).data);
      return { ...out, ownerPassword, madeOwner: !owner, restricted };
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceList sources={pdf.all} onRemove={(i) => (pdf.remove(i), job.reset())} /> : null}
      <PdfBatchDrop more={Boolean(source)} onFiles={(files) => (job.reset(), void pdf.loadMany(files))} onReject={pdf.setError} loading={pdf.loading} />
      <PdfLoadStatus pdf={pdf} />

      {source ? (
        <>
          <div className="flex flex-col gap-4 border border-border bg-card p-4">
            <PasswordField
              label="Password to open the PDF"
              value={password}
              onChange={(v) => (setPassword(v), job.reset())}
              autoComplete="new-password"
              onEnter={run}
              hint="Anyone who opens the file will need it. Leave it empty to only restrict printing or copying."
            />
            <Toggle label="Restrict printing, copying or editing" checked={restrict} onCheckedChange={(on) => (setRestrict(on), job.reset())} hint="Set by an owner password. Most readers respect it, but it is a request, not a lock." />
            {restrict ? (
              <div className="ml-12 flex flex-col gap-3 border-l border-dashed border-border pl-4">
                {PERMISSION_LABELS.map(({ key, label, hint }) => (
                  <Toggle key={key} label={label} hint={hint} checked={permissions[key]} onCheckedChange={(on) => (setPermissions((p) => ({ ...p, [key]: on })), job.reset())} />
                ))}
                <PasswordField label="Owner password (optional)" value={owner} onChange={(v) => (setOwner(v), job.reset())} autoComplete="new-password" hint="Needed to change the restrictions later. Leave it empty and a random one is made for you." />
              </div>
            ) : null}
          </div>

          {problem && (password || restrict) ? <Alert tone="warning">{problem}</Alert> : null}
          <RunButton busy={job.busy} disabled={problem !== null} onClick={run}>
            {pdf.all.length > 1 ? `Protect ${pdf.all.length} PDFs` : "Protect PDF"}
          </RunButton>
          <p className="-mt-3 text-sm text-muted-foreground">Encrypted with AES-256. Nobody can recover a forgotten password, including us, so keep it somewhere safe.</p>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? (
        <>
          <DownloadResult data={job.result.data} filename={job.result.filename} mime={job.result.mime} note={job.result.note ?? "AES-256"} continueWith={false} />
          {job.result.restricted && job.result.madeOwner ? (
            <Alert tone="info" title="Your owner password">
              <p>Keep it to lift the restrictions later. It is not stored anywhere else.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="bg-marker px-2 py-1 font-mono text-sm text-marker-foreground" data-testid="owner-password">
                  {job.result.ownerPassword}
                </code>
                <CopyButton text={job.result.ownerPassword} label="Copy owner password" />
              </div>
            </Alert>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
