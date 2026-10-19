"use client";

import { Fragment, useMemo } from "react";
import { Alert, Badge, CopyButton, Field, Input, Panel, ScrollArea, Select, Textarea, cn, useDebounced, useShareableState } from "@toolwright/ui";
import { REGEX_FLAGS, REGEX_PRESETS, replaceRegex, testRegex } from "@toolwright/core/regex";

export default function Tool() {
  const { state, setState } = useShareableState({ pattern: "", flags: "g", text: "", replacement: "" });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const dPattern = useDebounced(state.pattern, 150);
  const dText = useDebounced(state.text, 150);

  const result = useMemo(() => testRegex(dPattern, state.flags, dText), [dPattern, state.flags, dText]);
  const replaced = useMemo(() => (state.replacement !== "" && dPattern ? replaceRegex(dPattern, state.flags, dText, state.replacement) : null), [dPattern, state.flags, dText, state.replacement]);

  const highlighted = useMemo(() => {
    if (!result.ok || result.matches.length === 0) return null;
    const parts: { text: string; match: boolean }[] = [];
    let cursor = 0;
    for (const m of result.matches) {
      if (m.end === m.index) continue; // skip empty matches when painting
      if (m.index < cursor) continue;
      if (m.index > cursor) parts.push({ text: dText.slice(cursor, m.index), match: false });
      parts.push({ text: dText.slice(m.index, m.end), match: true });
      cursor = m.end;
    }
    if (cursor < dText.length) parts.push({ text: dText.slice(cursor), match: false });
    return parts;
  }, [result, dText]);

  const toggleFlag = (flag: string) => set({ flags: state.flags.includes(flag) ? state.flags.replace(flag, "") : state.flags + flag });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-[1fr_auto]">
        <Field label="Pattern" hint="Written without the surrounding slashes.">
          {(id) => (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 font-mono text-sm focus-within:border-ring focus-within:outline-2 focus-within:outline-ring/40">
              <span aria-hidden className="text-muted-foreground">/</span>
              <input id={id} className="h-10 min-w-0 flex-1 bg-transparent outline-none" spellCheck={false} value={state.pattern} onChange={(e) => set({ pattern: e.target.value })} placeholder="(\w+)@(\w+)\.com" />
              <span aria-hidden className="text-muted-foreground">/{state.flags}</span>
            </div>
          )}
        </Field>
        <Field label="Preset">
          {(id) => (
            <Select
              id={id}
              value=""
              onChange={(e) => {
                const preset = REGEX_PRESETS[Number(e.target.value)];
                if (preset) set({ pattern: preset.pattern, flags: preset.flags, text: preset.sample });
              }}
            >
              <option value="">Choose a preset…</option>
              {REGEX_PRESETS.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset className="flex flex-wrap gap-2 lg:col-span-2">
          <legend className="sr-only">Flags</legend>
          {REGEX_FLAGS.map((f) => (
            <label
              key={f.flag}
              title={f.description}
              className={cn(
                "cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                state.flags.includes(f.flag) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <input type="checkbox" className="sr-only" checked={state.flags.includes(f.flag)} onChange={() => toggleFlag(f.flag)} />
              {f.flag} <span className="font-sans text-[11px]">{f.label}</span>
            </label>
          ))}
        </fieldset>
      </div>

      {!result.ok ? <Alert tone="error" title="Invalid pattern">{result.error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Test text">
          <Textarea aria-label="Test text" rows={10} className="min-h-48" value={state.text} onChange={(e) => set({ text: e.target.value })} placeholder="Paste text to test against…" />
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-2">
              Matches {result.ok ? <Badge tone={result.matches.length ? "success" : "neutral"}>{result.matches.length}{result.truncated ? "+" : ""}</Badge> : null}
            </span>
          }
        >
          <pre aria-label="Highlighted matches" tabIndex={0} className="min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 font-mono text-[13px] leading-relaxed">
            {highlighted
              ? highlighted.map((p, i) => (p.match ? <mark key={i} className="rounded-sm bg-primary/25 px-0.5 text-foreground">{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))
              : dText || <span className="text-muted-foreground">Highlights appear here.</span>}
          </pre>
        </Panel>
      </div>

      {result.ok && result.matches.length > 0 ? (
        <Panel title="Match details">
          <ScrollArea label="Matches" className="max-h-96">
          <ol className="flex flex-col gap-2">
            {result.matches.slice(0, 200).map((m, i) => (
              <li key={i} className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono font-semibold">{m.match === "" ? "(empty match)" : m.match}</span>
                  <span className="text-xs text-muted-foreground">
                    #{i + 1} · index {m.index}–{m.end} · line {m.line}, col {m.column}
                  </span>
                </div>
                {m.groups.length > 0 ? (
                  <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 font-mono text-xs sm:grid-cols-2">
                    {m.groups.map((g, gi) => (
                      <li key={gi}>
                        <span className="text-muted-foreground">${gi + 1}:</span> {g === undefined ? <em className="text-muted-foreground">undefined</em> : JSON.stringify(g)}
                      </li>
                    ))}
                    {Object.entries(m.named).map(([name, value]) => (
                      <li key={name}>
                        <span className="text-muted-foreground">{name}:</span> {value === undefined ? <em>undefined</em> : JSON.stringify(value)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          </ScrollArea>
        </Panel>
      ) : null}

      <Panel title="Replace" actions={replaced?.ok ? <CopyButton text={replaced.output} /> : null}>
        <Field label="Replacement" hint="Use $1, $2 or $<name> to insert groups, and $& for the whole match.">
          {(id) => <Input id={id} mono value={state.replacement} onChange={(e) => set({ replacement: e.target.value })} placeholder="$2@$1" />}
        </Field>
        {replaced?.ok ? <Textarea aria-label="Replacement result" readOnly rows={6} value={replaced.output} className="bg-muted/40" /> : null}
        {replaced && !replaced.ok ? <Alert tone="error">{replaced.error}</Alert> : null}
      </Panel>
    </div>
  );
}
