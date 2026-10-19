"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plate, SegmentedControl, StatusLine, Textarea } from "@toolwright/ui";
import { base64Encode } from "@toolwright/core/encoding";
import { crc32, md5, sha, toHex } from "@toolwright/core/hash";
import { formatJson } from "@toolwright/core/json";
import { convertCase } from "@toolwright/core/text";
import { NetworkLedger } from "../network-ledger";

type TabId = "json" | "base64" | "hash" | "case";

const TABS: { id: TabId; label: string; slug: string; full: string; sample: string }[] = [
  { id: "json", label: "JSON", slug: "json-formatter", full: "JSON formatter", sample: '{"tool":"formatter","private":true,"uploads":0}' },
  { id: "base64", label: "Base64", slug: "base64-encoder", full: "Base64 tool", sample: "Nothing leaves this page." },
  { id: "hash", label: "Hash", slug: "hash-generator", full: "hash generator", sample: "hunter2" },
  { id: "case", label: "Case", slug: "case-converter", full: "case converter", sample: "keep the data" },
];

/** Pure, synchronous results so the server and the browser render exactly the same first frame. */
function run(tab: TabId, input: string): { ok: true; lines: { label?: string; text: string }[] } | { ok: false; error: string } {
  try {
    switch (tab) {
      case "json":
        return { ok: true, lines: [{ text: formatJson(input, { indent: 2 }) }] };
      case "base64":
        return { ok: true, lines: [{ text: base64Encode(input) }] };
      case "hash":
        return { ok: true, lines: [{ label: "MD5", text: md5(input) }, { label: "CRC-32", text: crc32(input).toString(16).padStart(8, "0") }] };
      case "case":
        return {
          ok: true,
          lines: (["camel", "snake", "kebab", "constant", "title"] as const).map((style) => ({ label: style, text: convertCase(input, style) })),
        };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not process that." };
  }
}

/**
 * The Bench: a working miniature of three real tools. It runs the same @toolwright/core functions the full tools use,
 * on text you can edit, with the network ledger underneath to show that nothing goes anywhere.
 */
export function HeroBench() {
  const [tab, setTab] = useState<TabId>("json");
  const [inputs, setInputs] = useState<Record<TabId, string>>({ json: TABS[0]!.sample, base64: TABS[1]!.sample, hash: TABS[2]!.sample, case: TABS[3]!.sample });
  const [sha256, setSha256] = useState<string>("");
  const current = TABS.find((t) => t.id === tab)!;
  const input = inputs[tab];

  const result = useMemo(() => run(tab, input), [tab, input]);

  // SHA-256 uses Web Crypto, which is asynchronous, so it fills in after the first paint.
  useEffect(() => {
    if (tab !== "hash") return;
    let cancelled = false;
    sha("SHA-256", input).then((bytes) => !cancelled && setSha256(toHex(bytes)));
    return () => {
      cancelled = true;
    };
  }, [tab, input]);

  return (
    <Plate
      label="The bench · live"
      className="rise"
      footer={
        <StatusLine>
          <NetworkLedger link={false} />
          <span>Edit the text. Watch the counter.</span>
        </StatusLine>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Try a tool"
          value={tab}
          onValueChange={setTab}
          options={TABS.map((t) => ({ value: t.id, label: t.label }))}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bench-input" className="label-plate">
            Input
          </label>
          <Textarea id="bench-input" rows={3} value={input} onChange={(e) => setInputs((s) => ({ ...s, [tab]: e.target.value }))} className="min-h-0 resize-none" />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label-plate" id="bench-output-label">
            Result
          </span>
          <div role="group" aria-labelledby="bench-output-label" aria-live="polite" className="min-h-[9.5rem] border border-border bg-muted p-3 font-mono text-[13px] leading-relaxed">
            {result.ok ? (
              <>
                {result.lines.map((line, i) => (
                  <div key={i} className="flex gap-3">
                    {line.label ? <span className="label-plate w-14 shrink-0 pt-0.5">{line.label}</span> : null}
                    <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono">{line.text}</pre>
                  </div>
                ))}
                {tab === "hash" ? (
                  <div className="flex gap-3">
                    <span className="label-plate w-14 shrink-0 pt-0.5">SHA-256</span>
                    <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono">{sha256 || "…"}</pre>
                  </div>
                ) : null}
              </>
            ) : (
              <p role="alert" className="text-danger">
                {result.error}
              </p>
            )}
          </div>
        </div>

        <Link href={`/tools/${current.slug}`} className="self-start text-sm font-semibold underline decoration-2 underline-offset-4 hover:bg-marker hover:text-marker-foreground">
          Open the full {current.full} →
        </Link>
      </div>
    </Plate>
  );
}
