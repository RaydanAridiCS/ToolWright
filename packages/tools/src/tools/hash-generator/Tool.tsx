"use client";

import { useEffect, useState } from "react";
import { Alert, Field, FileDropzone, FileListItem, Input, Panel, SegmentedControl, Textarea, useDebounced } from "@toolwright/ui";
import { hashAll, hmac, SHA_ALGORITHMS, toHex, type HashResult } from "@toolwright/core/hash";
import { utf8ToBytes } from "@toolwright/core/encoding";
import { ResultRow } from "../../shared/result-row";
import { errorMessage } from "../../shared/format";

type Mode = "text" | "file";

interface LoadedFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

export default function Tool() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [key, setKey] = useState("");
  const [compare, setCompare] = useState("");
  const [results, setResults] = useState<HashResult[]>([]);
  const [macs, setMacs] = useState<{ algorithm: string; hex: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dText = useDebounced(text, 150);

  useEffect(() => {
    let cancelled = false;
    const bytes = mode === "file" ? file?.bytes : dText ? utf8ToBytes(dText) : undefined;
    if (!bytes) {
      setResults([]);
      setMacs([]);
      return;
    }
    setBusy(true);
    (async () => {
      try {
        const hashes = await hashAll(bytes);
        const mac = key && mode === "text" ? await Promise.all(SHA_ALGORITHMS.map(async (a) => ({ algorithm: `HMAC-${a}`, hex: toHex(await hmac(a, key, dText)) }))) : [];
        if (!cancelled) {
          setResults(hashes);
          setMacs(mac);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, dText, file, key]);

  const needle = compare.trim().toLowerCase().replace(/\s+/g, "");
  const match = needle ? [...results, ...macs].find((r) => r.hex.toLowerCase() === needle) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label="Input type"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "text", label: "Text" },
          { value: "file", label: "File" },
        ]}
      />

      {mode === "text" ? (
        <Panel title="Text to hash">
          <Textarea aria-label="Text to hash" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text…" />
        </Panel>
      ) : file ? (
        <ul>
          <FileListItem name={file.name} size={file.size} onRemove={() => setFile(null)} />
        </ul>
      ) : (
        <FileDropzone
          label="Drop a file to hash, or click to browse"
          onReject={setError}
          onFiles={async ([f]) => {
            if (!f) return;
            setError(null);
            setFile({ name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) });
          }}
        />
      )}

      {mode === "text" ? (
        <Field label="HMAC key (optional)" hint="Enter a secret key to also compute HMAC-SHA digests of the text above.">
          {(id) => <Input id={id} mono type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />}
        </Field>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      {results.length > 0 ? (
        <Panel title={busy ? "Hashes (calculating…)" : "Hashes"}>
          <div className="grid gap-3">
            {results.map((r) => (
              <ResultRow key={r.algorithm} label={r.algorithm} value={r.hex} hint={r.base64 ? `Base64: ${r.base64}` : undefined} />
            ))}
            {macs.map((m) => (
              <ResultRow key={m.algorithm} label={m.algorithm} value={m.hex} />
            ))}
          </div>
          <Field label="Compare with a known hash" hint="Paste an expected checksum to see whether it matches.">
            {(id) => <Input id={id} mono value={compare} onChange={(e) => setCompare(e.target.value)} placeholder="e.g. e3b0c44298fc1c14…" />}
          </Field>
          {needle ? match ? <Alert tone="success" title={`Match: ${match.algorithm}`} /> : <Alert tone="warning" title="No hash matches the value you entered." /> : null}
        </Panel>
      ) : null}
    </div>
  );
}
