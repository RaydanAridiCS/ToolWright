"use client";

import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Alert, Button, CopyButton, Panel, ScrollArea, SegmentedControl, Stat, StatGrid, Textarea, Toggle, cn, useShareableState } from "@toolwright/ui";
import { diffStats, diffText, toSplitRows, unifiedPatch, type DiffMode } from "@toolwright/core/diff";

type View = "split" | "inline";

const SAMPLE_A = "The quick brown fox\njumps over the lazy dog.\nThis line stays the same.\nRemove me.";
const SAMPLE_B = "The quick red fox\njumps over the lazy dog.\nThis line stays the same.\nA brand new line.";

export default function Tool() {
  const { state, setState } = useShareableState({ a: "", b: "", mode: "lines" as DiffMode, view: "split" as View, ignoreCase: false, ignoreWhitespace: false });
  const { a, b, mode, view, ignoreCase, ignoreWhitespace } = state;
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const segments = useMemo(() => diffText(a, b, { mode, ignoreCase, ignoreWhitespace }), [a, b, mode, ignoreCase, ignoreWhitespace]);
  const stats = useMemo(() => diffStats(segments, mode), [segments, mode]);
  const rows = useMemo(() => (mode === "lines" ? toSplitRows(segments) : []), [segments, mode]);
  const patch = useMemo(() => (a || b ? unifiedPatch(a, b) : ""), [a, b]);
  const unit = mode === "lines" ? "line" : mode === "words" ? "word" : "character";
  const empty = !a && !b;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Original"
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set({ a: SAMPLE_A, b: SAMPLE_B })}
            >
              Sample
            </Button>
          }
        >
          <Textarea aria-label="Original text" rows={12} className="min-h-48" value={a} onChange={(e) => set({ a: e.target.value })} placeholder="Original text" />
        </Panel>
        <Panel
          title="Changed"
          actions={
            <Button size="sm" variant="ghost" disabled={!a && !b} onClick={() => set({ a: b, b: a })}>
              <ArrowLeftRight /> Swap
            </Button>
          }
        >
          <Textarea aria-label="Changed text" rows={12} className="min-h-48" value={b} onChange={(e) => set({ b: e.target.value })} placeholder="Changed text" />
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4">
        <SegmentedControl
          label="Compare by"
          value={mode}
          onValueChange={(v) => set({ mode: v })}
          options={[
            { value: "lines", label: "Lines" },
            { value: "words", label: "Words" },
            { value: "chars", label: "Characters" },
          ]}
        />
        {mode === "lines" ? (
          <SegmentedControl
            label="View"
            value={view}
            onValueChange={(v) => set({ view: v })}
            options={[
              { value: "split", label: "Side by side" },
              { value: "inline", label: "Inline" },
            ]}
          />
        ) : null}
        <Toggle label="Ignore case" checked={ignoreCase} onCheckedChange={(v) => set({ ignoreCase: v })} />
        {mode === "lines" ? <Toggle label="Ignore whitespace" checked={ignoreWhitespace} onCheckedChange={(v) => set({ ignoreWhitespace: v })} /> : null}
      </div>

      {empty ? null : stats.identical ? (
        <Alert tone="success" title="The texts are identical." />
      ) : (
        <>
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <Stat label={`${unit}s added`} value={<span className="text-success">+{stats.added}</span>} />
            <Stat label={`${unit}s removed`} value={<span className="text-danger">−{stats.removed}</span>} />
            <Stat label={`${unit}s unchanged`} value={stats.unchanged} />
          </StatGrid>

          {mode === "lines" && view === "split" ? (
            <ScrollArea label="Side by side differences" className="rounded-xl border border-border bg-card">
              <table className="w-full table-fixed border-collapse font-mono text-[13px]">
                <caption className="sr-only">Side by side differences</caption>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="align-top">
                      <DiffCell cell={row.left} side="left" />
                      <DiffCell cell={row.right} side="right" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          ) : (
            <pre tabIndex={0} className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-card p-4 font-mono text-[13px] leading-relaxed" aria-label="Inline differences">
              {segments.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    s.type === "added" && "bg-success/20 text-foreground",
                    s.type === "removed" && "bg-danger/20 text-foreground line-through decoration-danger/60",
                  )}
                >
                  {s.value}
                </span>
              ))}
            </pre>
          )}

          <Panel title="Unified patch" actions={<CopyButton text={patch} label="Copy patch" />}>
            <Textarea aria-label="Unified patch" readOnly value={patch} rows={8} className="bg-muted/40" />
          </Panel>
        </>
      )}
    </div>
  );
}

function DiffCell({ cell, side }: { cell?: { number: number; text: string; changed: boolean }; side: "left" | "right" }) {
  const tone = cell?.changed ? (side === "left" ? "bg-danger/15" : "bg-success/15") : cell ? "" : "bg-muted/50";
  return (
    <td className={cn("w-1/2 border-b border-border/50 px-0", side === "left" && "border-r", tone)}>
      <div className="flex">
        <span aria-hidden className="w-10 shrink-0 select-none px-2 py-0.5 text-right text-muted-foreground/70">
          {cell?.number ?? ""}
        </span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words px-2 py-0.5">{cell?.text ?? ""}</span>
      </div>
    </td>
  );
}
