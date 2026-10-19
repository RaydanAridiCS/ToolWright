"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, ClipboardPaste, Eraser, FileUp, Link2, RefreshCw, Sparkles } from "lucide-react";
import { CopyButton, DownloadButton } from "./actions";
import { Button } from "./button";
import { Alert } from "./display";
import { Field, Input, Select, Textarea, Toggle } from "./form";
import { Panel } from "./display";
import { useDebounced } from "./hooks/use-debounced";
import { useShareableState } from "./hooks/use-shareable-state";
import { cn } from "./cn";
import { readFileText } from "./files";

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

interface OptionBase {
  key: string;
  label: string;
  hint?: string;
}

export type OptionDef =
  | (OptionBase & { type: "select"; options: { value: string; label: string }[]; default: string })
  | (OptionBase & { type: "toggle"; default: boolean })
  | (OptionBase & { type: "number"; default: number; min?: number; max?: number; step?: number })
  | (OptionBase & { type: "text"; default: string; placeholder?: string });

export interface TransformContext {
  input: string;
  output: string;
  options: OptionValues;
}

export interface TransformToolProps {
  /** Pure function (sync or async). Throw an Error to show its message to the user. */
  transform: (input: string, options: OptionValues) => string | Promise<string>;
  options?: OptionDef[];
  inputLabel?: string;
  outputLabel?: string;
  inputPlaceholder?: string;
  sample?: string;
  /** Run the transform even when the input is empty (for generators). */
  runOnEmpty?: boolean;
  outputFilename?: string;
  outputMime?: string;
  /** Visible rows for the text areas. */
  rows?: number;
  /** Mirror input and options into the URL hash so they can be shared. Default true. */
  shareable?: boolean;
  /** Accept a text file as input, e.g. ".json,.txt". */
  acceptFile?: string;
  /** Hide the input panel (for generators that only need options). */
  hideInput?: boolean;
  inputMono?: boolean;
  outputMono?: boolean;
  /** Extra UI under the editors, e.g. statistics. */
  renderExtra?: (context: TransformContext) => ReactNode;
  /** Show a "Regenerate" button that re-runs the transform (for random generators). */
  regenerate?: boolean;
  className?: string;
}

export function defaultOptionValues(options: OptionDef[] = []): OptionValues {
  return Object.fromEntries(options.map((o) => [o.key, o.default]));
}

interface ToolState extends Record<string, unknown> {
  input: string;
  options: OptionValues;
}

export function TransformTool({
  transform,
  options = [],
  inputLabel = "Input",
  outputLabel = "Output",
  inputPlaceholder = "Type or paste here…",
  sample,
  runOnEmpty = false,
  outputFilename = "output.txt",
  outputMime = "text/plain",
  rows = 12,
  shareable = true,
  acceptFile,
  hideInput = false,
  inputMono = true,
  outputMono = true,
  renderExtra,
  regenerate = false,
  className,
}: TransformToolProps) {
  // `options` is usually an inline array, so key everything on its serialized defaults to keep identities stable.
  const defaultsKey = JSON.stringify(options.map((o) => [o.key, o.default]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => defaultOptionValues(options), [defaultsKey]);
  const { state, setState, shareUrl } = useShareableState<ToolState>({ input: "", options: defaults }, { enabled: shareable });
  const debounced = useDebounced(state, 120);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Options restored from a shared link may be missing keys added later.
  const values = useMemo(() => ({ ...defaults, ...state.options }), [defaults, state.options]);
  const debouncedValues = useMemo(() => ({ ...defaults, ...debounced.options }), [defaults, debounced.options]);
  const valuesRef = useRef(debouncedValues);
  valuesRef.current = debouncedValues;
  const valuesKey = JSON.stringify(debouncedValues);

  useEffect(() => {
    let cancelled = false;
    if (debounced.input === "" && !runOnEmpty) {
      setOutput("");
      setError(null);
      return;
    }
    Promise.resolve()
      .then(() => transformRef.current(debounced.input, valuesRef.current))
      .then((result) => {
        if (cancelled) return;
        setOutput(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOutput("");
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [debounced.input, valuesKey, runOnEmpty, nonce]);

  const setInput = (input: string) => setState((s) => ({ ...s, input }));
  const setOption = (key: string, value: OptionValue) => setState((s) => ({ ...s, options: { ...s.options, [key]: value } }));

  const paste = async () => {
    try {
      setInput(await navigator.clipboard.readText());
    } catch {
      setFileError("Your browser blocked clipboard access. Paste with Ctrl+V instead.");
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > 20 * 1024 * 1024) {
      setFileError("That file is larger than 20 MB, which is too big to edit here.");
      return;
    }
    setInput(await readFileText(file));
  };

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {options.length > 0 ? (
        <div className="grid gap-x-5 gap-y-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Options">
          {options.map((o) => {
            const value = values[o.key];
            if (o.type === "toggle") {
              return <Toggle key={o.key} label={o.label} hint={o.hint} checked={Boolean(value)} onCheckedChange={(v) => setOption(o.key, v)} />;
            }
            return (
              <Field key={o.key} label={o.label} hint={o.hint}>
                {(id) =>
                  o.type === "select" ? (
                    <Select id={id} value={String(value)} onChange={(e) => setOption(o.key, e.target.value)}>
                      {o.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  ) : o.type === "number" ? (
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      value={String(value)}
                      min={o.min}
                      max={o.max}
                      step={o.step}
                      onChange={(e) => setOption(o.key, e.target.value === "" ? o.default : Number(e.target.value))}
                    />
                  ) : (
                    <Input id={id} value={String(value)} placeholder={o.placeholder} onChange={(e) => setOption(o.key, e.target.value)} />
                  )
                }
              </Field>
            );
          })}
        </div>
      ) : null}

      <div className={cn("grid gap-5", !hideInput && "lg:grid-cols-2")}>
        {hideInput ? null : (
          <Panel
            title={inputLabel}
            actions={
              <>
                {sample ? (
                  <Button size="sm" variant="ghost" onClick={() => setInput(sample)}>
                    <Sparkles /> Sample
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={paste}>
                  <ClipboardPaste /> Paste
                </Button>
                {acceptFile ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                      <FileUp /> Open file
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={acceptFile}
                      className="sr-only"
                      aria-label="Open a file"
                      tabIndex={-1}
                      onChange={(e) => {
                        void loadFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </>
                ) : null}
                <Button size="sm" variant="ghost" disabled={!state.input} onClick={() => setInput("")}>
                  <Eraser /> Clear
                </Button>
              </>
            }
          >
            <Textarea
              aria-label={inputLabel}
              value={state.input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              rows={rows}
              mono={inputMono}
              className="min-h-40"
            />
          </Panel>
        )}

        <Panel
          title={outputLabel}
          actions={
            <>
              {!hideInput ? (
                <Button size="sm" variant="ghost" disabled={!output} onClick={() => setInput(output)} title="Replace the input with this output">
                  <ArrowDownUp /> Use as input
                </Button>
              ) : null}
              {regenerate ? (
                <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                  <RefreshCw /> Regenerate
                </Button>
              ) : null}
              <CopyButton text={output} />
              <DownloadButton data={output} filename={outputFilename} mime={outputMime} />
            </>
          }
        >
          <Textarea aria-label={outputLabel} value={output} readOnly rows={rows} mono={outputMono} placeholder="Result appears here" className="min-h-40 bg-muted/40" />
        </Panel>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {fileError ? <Alert tone="warning">{fileError}</Alert> : null}

      {renderExtra ? renderExtra({ input: debounced.input, output, options: debouncedValues }) : null}

      {shareable && shareUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link2 aria-hidden className="size-3.5" />
          <span>Your input is saved in this page&rsquo;s link (after the #), which is never sent to a server.</span>
          <CopyButton text={shareUrl} label="Copy share link" copiedLabel="Link copied" variant="ghost" />
        </div>
      ) : null}
    </div>
  );
}
