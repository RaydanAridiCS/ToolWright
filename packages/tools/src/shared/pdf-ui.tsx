"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, DownloadButton, FileDropzone, FileListItem, Select, baseName, formatFileSize } from "@toolwright/ui";
import { getPdfInfo, isPdf, type PdfInfo } from "@toolwright/core/pdf";
import { errorMessage } from "./format";
import { createZip, type ZipEntry } from "./zip";
import { canHandOff, currentToolSlug, handOffPdf, HANDOFF_TARGETS, usePdfHandoff } from "./pdf-handoff";
import { PasswordField } from "./password-field";

export interface PdfSource {
  file: File;
  bytes: Uint8Array;
  info: PdfInfo;
}

/** A dropped PDF that needs its password before it can be used. */
export interface LockedPdf {
  locked: true;
  file: File;
  bytes: Uint8Array;
}

/** Wraps decrypted bytes as a source with the original name, so previews and downloads read the unlocked file. */
async function sourceFrom(file: File, bytes: Uint8Array): Promise<PdfSource> {
  const plain = new File([bytes as Uint8Array<ArrayBuffer>], file.name, { type: "application/pdf", lastModified: file.lastModified });
  return { file: plain, bytes, info: await getPdfInfo(bytes) };
}

/**
 * Reads one dropped file into a PdfSource, or throws a message naming the file. A password-protected PDF comes
 * back as a LockedPdf; one that opens without a password (it only restricts printing or copying) is decrypted
 * straight away, as any reader would open it. The crypto code loads only when such a file turns up.
 */
export async function readPdfFile(file: File): Promise<PdfSource | LockedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) throw new Error(`${file.name} does not look like a PDF file.`);
  try {
    return { file, bytes, info: await getPdfInfo(bytes) };
  } catch (err) {
    if (!/password-protected/.test(errorMessage(err))) throw err;
    const { decryptPdf, readPdfSecurity } = await import("@toolwright/core/pdf-crypto");
    const security = await readPdfSecurity(bytes);
    if (security && !security.needsPassword) return sourceFrom(file, await decryptPdf(bytes, ""));
    return { locked: true, file, bytes };
  }
}

export const isLockedPdf = (x: PdfSource | LockedPdf): x is LockedPdf => "locked" in x;

/**
 * The queue of password-protected files waiting for their password. `unlock` opens the first one and hands it
 * to `onOpened`; a wrong password keeps it waiting with a message. Render it with `PdfLoadStatus`.
 */
export function useLockedPdfs(onOpened: (source: PdfSource) => void) {
  const [locked, setLocked] = useState<LockedPdf[]>([]);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const opened = useRef(onOpened);
  useEffect(() => {
    opened.current = onOpened;
  });

  const addLocked = useCallback((items: LockedPdf[], replace = false) => {
    setUnlockError(null);
    setLocked((current) => (replace ? items : [...current, ...items]));
  }, []);

  /** Resolves true when the file opened. */
  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      const first = locked[0];
      if (!first) return false;
      setUnlockError(null);
      setUnlocking(true);
      try {
        const { decryptPdf } = await import("@toolwright/core/pdf-crypto");
        const source = await sourceFrom(first.file, await decryptPdf(first.bytes, password));
        setLocked((current) => current.slice(1));
        opened.current(source);
        return true;
      } catch (err) {
        setUnlockError(errorMessage(err));
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [locked],
  );

  const skipLocked = useCallback(() => {
    setUnlockError(null);
    setLocked((current) => current.slice(1));
  }, []);

  return { locked, unlockError, unlocking, addLocked, unlock, skipLocked };
}

/**
 * Loads a PDF from a drop, reads its structure, and tracks errors.
 *
 * Tools that support batch work call `loadMany` with every dropped file: `all` then holds each readable PDF,
 * `source` is the first one (for previews and page counts), and files that could not be read are reported by name.
 * Password-protected files wait in `locked` until `unlock(password)` opens them (render `PdfLoadStatus`).
 */
export function usePdfSource() {
  const [all, setAll] = useState<PdfSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const locks = useLockedPdfs((source) => setAll((current) => [...current, source]));
  const { addLocked } = locks;

  const load = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const read = await readPdfFile(file);
        setAll(isLockedPdf(read) ? [] : [read]);
        addLocked(isLockedPdf(read) ? [read] : [], true);
      } catch (err) {
        setAll([]);
        addLocked([], true);
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [addLocked],
  );

  /** Adds files to the batch (keeping the ones already there). */
  const loadMany = useCallback(
    async (files: File[]) => {
      setLoading(true);
      setError(null);
      const read: PdfSource[] = [];
      const waiting: LockedPdf[] = [];
      const problems: string[] = [];
      for (const file of files) {
        try {
          const one = await readPdfFile(file);
          if (isLockedPdf(one)) waiting.push(one);
          else read.push(one);
        } catch (err) {
          problems.push(errorMessage(err));
        }
      }
      setAll((current) => [...current, ...read]);
      addLocked(waiting);
      if (problems.length) setError(problems.join(" "));
      setLoading(false);
    },
    [addLocked],
  );

  const remove = useCallback((index: number) => {
    setAll((current) => current.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => {
    setAll([]);
    addLocked([], true);
    setError(null);
  }, [addLocked]);

  // A file passed on from another tool ("Continue with…") loads as if it had been dropped.
  usePdfHandoff((file) => void load(file));

  return { source: all[0] ?? null, all, ...locks, error, setError, loading, load, loadMany, remove, clear };
}

export type PdfSourceState = ReturnType<typeof usePdfSource>;

/** The load error, if any, and a password prompt for each password-protected file waiting to be opened. */
export function PdfLoadStatus({ pdf }: { pdf: Pick<PdfSourceState, "error" | "locked" | "unlockError" | "unlocking" | "unlock" | "skipLocked"> }) {
  const [password, setPassword] = useState("");
  const first = pdf.locked[0];
  const submit = () => {
    if (!password) return;
    void pdf.unlock(password).then((opened) => {
      if (opened) setPassword("");
    });
  };
  return (
    <>
      {pdf.error ? <Alert tone="error">{pdf.error}</Alert> : null}
      {first ? (
        <div className="flex flex-col gap-3 border border-l-4 border-foreground border-l-marker bg-card p-4" role="group" aria-label={`Password for ${first.file.name}`}>
          <p className="text-sm">
            <span className="font-medium">{first.file.name}</span> is password-protected. Type its password to open it here. It is decrypted in this tab and the password is not stored.
            {pdf.locked.length > 1 ? ` ${pdf.locked.length - 1} more protected file${pdf.locked.length === 2 ? "" : "s"} after this one.` : ""}
          </p>
          <PasswordField label="PDF password" value={password} onChange={setPassword} onEnter={submit} autoComplete="current-password" invalid={pdf.unlockError !== null} />
          {pdf.unlockError ? <Alert tone="error">{pdf.unlockError}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" disabled={!password || pdf.unlocking} onClick={submit}>
              {pdf.unlocking ? <Loader2 className="animate-spin" /> : null}
              Open PDF
            </Button>
            <Button variant="ghost" size="md" onClick={() => (setPassword(""), pdf.skipLocked())}>
              {pdf.locked.length > 1 ? "Skip this file" : "Cancel"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PdfDrop({ onFile, onReject, loading }: { onFile: (file: File) => void; onReject?: (message: string) => void; loading?: boolean }) {
  return (
    <FileDropzone
      accept=".pdf,application/pdf"
      label={loading ? "Reading PDF…" : "Drop a PDF here, or click to browse"}
      hint="Your PDF is processed in this tab and never uploaded."
      disabled={loading}
      onReject={onReject}
      onFiles={([f]) => f && onFile(f)}
    />
  );
}

/** Drop zone for tools that can process many PDFs with the same settings. */
export function PdfBatchDrop({ onFiles, onReject, loading, more = false }: { onFiles: (files: File[]) => void; onReject?: (message: string) => void; loading?: boolean; more?: boolean }) {
  return (
    <FileDropzone
      accept=".pdf,application/pdf"
      multiple
      label={loading ? "Reading PDFs…" : more ? "Add more PDFs" : "Drop one or more PDFs here, or click to browse"}
      hint={more ? "Every file gets the same settings." : "Drop several files to process them all at once. Nothing is uploaded."}
      disabled={loading}
      onReject={onReject}
      onFiles={onFiles}
    />
  );
}

/** The batch: one row per file, each removable. */
export function PdfSourceList({ sources, onRemove }: { sources: PdfSource[]; onRemove: (index: number) => void }) {
  return (
    <ul aria-label={`${sources.length} PDF${sources.length === 1 ? "" : "s"} to process`} className="flex flex-col gap-2">
      {sources.map((s, i) => (
        <FileListItem key={`${s.file.name}-${s.file.size}-${i}`} name={s.file.name} size={s.file.size} detail={`${s.info.pageCount} page${s.info.pageCount === 1 ? "" : "s"}`} onRemove={() => onRemove(i)} />
      ))}
    </ul>
  );
}

export interface BatchOutput {
  data: Uint8Array;
  filename: string;
  mime: string;
  note?: string;
}

/**
 * Runs `work` on every file, one at a time, and returns one PDF (a single file) or one ZIP (several files).
 * A failure names the file it happened on.
 */
export async function runOnAll<S extends { file: File }>(sources: S[], suffix: string, work: (source: S) => Promise<Uint8Array>, onProgress?: (done: number, total: number) => void): Promise<BatchOutput> {
  const outputs: ZipEntry[] = [];
  for (const [i, source] of sources.entries()) {
    onProgress?.(i, sources.length);
    try {
      outputs.push({ name: `${baseName(source.file.name)}-${suffix}.pdf`, data: await work(source) });
    } catch (err) {
      throw new Error(sources.length > 1 ? `${source.file.name}: ${errorMessage(err)}` : errorMessage(err));
    }
  }
  onProgress?.(sources.length, sources.length);
  const [only] = outputs;
  if (outputs.length === 1 && only) return { data: only.data, filename: only.name, mime: "application/pdf" };
  return { data: createZip(outputs), filename: `${suffix}-pdfs.zip`, mime: "application/zip", note: `${outputs.length} PDFs` };
}

export function PdfSourceCard({ source, onRemove }: { source: PdfSource; onRemove: () => void }) {
  return (
    <ul>
      <FileListItem name={source.file.name} size={source.file.size} detail={`${source.info.pageCount} page${source.info.pageCount === 1 ? "" : "s"}`} onRemove={onRemove} />
    </ul>
  );
}

/** Runs an async job with busy and error state. */
export function useJob<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (job: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await job());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, error, busy, run, reset };
}

export function RunButton({ busy, disabled, onClick, children }: { busy: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="primary" size="lg" disabled={busy || disabled} onClick={onClick} className="self-start">
      {busy ? <Loader2 className="animate-spin" /> : null}
      {busy ? "Working…" : children}
    </Button>
  );
}

/** Progress for long jobs: a flat bar, a label such as "Page 3 of 12", and a polite spoken update every quarter. */
export function RunProgress({ label, done, total }: { label: string; done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2.5 border border-foreground bg-card">
        <div className="h-full bg-marker" style={{ width: `${percent}%` }} />
      </div>
      <p role="status" className="sr-only">
        {Math.floor(percent / 25) * 25}% done
      </p>
    </div>
  );
}

export function JobError({ error }: { error: string | null }) {
  return error ? <Alert tone="error">{error}</Alert> : null;
}

/** `continueWith={false}` hides the hand-off row, for results other tools could not open (a password-protected PDF). */
export function DownloadResult({ data, filename, mime = "application/pdf", note, continueWith = true }: { data: Uint8Array; filename: string; mime?: string; note?: string; continueWith?: boolean }) {
  return (
    <div className="flex flex-col gap-3 border border-l-4 border-foreground border-l-success bg-card p-4 shadow-md">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Done! Your file is ready.</p>
          <p className="truncate text-sm text-muted-foreground">
            {filename} · {formatFileSize(data.length)}
            {note ? ` · ${note}` : ""}
          </p>
        </div>
        <DownloadButton data={data} filename={filename} mime={mime} variant="primary" size="md" label="Download" />
      </div>
      {continueWith && mime === "application/pdf" ? <ContinueWith data={data} filename={filename} /> : null}
    </div>
  );
}

const QUICK_TARGETS = 4;

/**
 * Buttons that open the finished PDF in another tool, already loaded. The file moves in memory during a
 * client-side navigation; it is not stored or sent anywhere.
 */
export function ContinueWith({ data, filename }: { data: Uint8Array; filename: string }) {
  const [ready, setReady] = useState(false);
  // Read after mount: the navigator and the current path only exist in the browser.
  useEffect(() => setReady(canHandOff()), []);
  if (!ready) return null;
  const here = currentToolSlug();
  const targets = HANDOFF_TARGETS.filter((t) => t.slug !== here);
  const quick = targets.slice(0, QUICK_TARGETS);
  const more = targets.slice(QUICK_TARGETS);
  const go = (slug: string) => handOffPdf(slug, filename, data);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3">
      <span className="text-sm text-muted-foreground">Continue with this file:</span>
      {quick.map((t) => (
        <Button key={t.slug} variant="outline" size="sm" onClick={() => go(t.slug)}>
          {t.label}
        </Button>
      ))}
      <Select
        aria-label="More tools to continue with"
        className="h-8 w-auto text-[13px]"
        value=""
        onChange={(e) => {
          if (e.target.value) go(e.target.value);
        }}
      >
        <option value="">More tools…</option>
        {more.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
