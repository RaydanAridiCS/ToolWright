"use client";

import { useMemo } from "react";
import { Alert, Badge, Button, CopyButton, Field, Panel, ScrollArea, Select, Stat, StatGrid, Textarea, useShareableState } from "@toolwright/ui";
import { validateJsonAgainstSchema, type SchemaDraftId } from "@toolwright/core/json-schema-validator";

const SAMPLE_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["id", "email"],
    properties: {
      id: { type: "integer", minimum: 1 },
      name: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      role: { enum: ["admin", "editor", "viewer"] },
      joined: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
  null,
  2,
);

const SAMPLE_DATA = JSON.stringify({ id: 1, name: "Ada Lovelace", email: "ada@example.com", role: "boss", extra: true }, null, 2);

const DRAFT_OPTIONS: { value: SchemaDraftId; label: string }[] = [
  { value: "2020-12", label: "2020-12" },
  { value: "2019-09", label: "2019-09" },
  { value: "draft-07", label: "Draft 7" },
  { value: "draft-06", label: "Draft 6" },
  { value: "draft-04", label: "Draft 4" },
];

export default function Tool() {
  const { state, setState } = useShareableState({ data: SAMPLE_DATA, schema: SAMPLE_SCHEMA, draft: "auto" });
  const { data, schema, draft } = state;
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const outcome = useMemo<{ result: ReturnType<typeof validateJsonAgainstSchema> } | { error: string } | null>(() => {
    if (!data.trim() && !schema.trim()) return null;
    try {
      return { result: validateJsonAgainstSchema(data, schema, { draft: draft as SchemaDraftId | "auto" }) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "This schema could not be checked." };
    }
  }, [data, schema, draft]);

  const result = outcome && "result" in outcome ? outcome.result : null;
  const report = result
    ? result.valid
      ? "The document is valid."
      : result.issues.map((issue) => `${issue.path}: ${issue.message} (${issue.keyword})`).join("\n") + (result.truncated ? `\n… and ${result.total - result.issues.length} more.` : "")
    : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Schema"
          actions={
            <Button size="sm" variant="ghost" onClick={() => set({ schema: SAMPLE_SCHEMA, data: SAMPLE_DATA })}>
              Sample
            </Button>
          }
        >
          <Textarea
            aria-label="JSON Schema"
            rows={14}
            className="min-h-56 font-mono"
            value={schema}
            onChange={(e) => set({ schema: e.target.value })}
            placeholder="Paste the JSON Schema here"
            spellCheck={false}
          />
        </Panel>
        <Panel
          title="Document"
          actions={
            <Button size="sm" variant="ghost" disabled={!schema} onClick={() => set({ data: "" })}>
              Clear
            </Button>
          }
        >
          <Textarea
            aria-label="JSON document"
            rows={14}
            className="min-h-56 font-mono"
            value={data}
            onChange={(e) => set({ data: e.target.value })}
            placeholder="Paste the JSON to check here"
            spellCheck={false}
          />
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4">
        <Field label="Schema version">
          {(id) => (
            <Select id={id} className="w-44" value={draft} onChange={(e) => set({ draft: e.target.value })}>
              <option value="auto">Auto (from $schema)</option>
              {DRAFT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="text-sm text-muted-foreground">
          {result?.draft ? `Checked against ${result.draft.replace("draft-", "Draft ")}.` : "Unstated $schema is treated as 2020-12."}
        </p>
      </div>

      {outcome && "error" in outcome ? <Alert tone="error" title={outcome.error} /> : null}

      {result?.valid ? <Alert tone="success" title="The document is valid. Every check passed." /> : null}

      {result && !result.valid ? (
        <>
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <Stat label="Problems" value={result.total} />
            <Stat label="Draft" value={result.draft ?? "not stated"} />
            <Stat label="Shown" value={result.truncated ? `first ${result.issues.length} of ${result.total}` : result.total} />
          </StatGrid>

          <Panel title="Problems" actions={<CopyButton text={report} label="Copy report" />}>
            <ScrollArea label="List of validation problems" className="rounded-xl border border-border bg-card">
              <table className="w-full border-collapse text-left font-mono text-[13px]">
                <caption className="sr-only">Problems found while validating the document</caption>
                <thead className="sr-only">
                  <tr>
                    <th>Keyword</th>
                    <th>Path</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.issues.map((issue, i) => (
                    <tr key={i} className="border-b border-border/50 align-top last:border-b-0">
                      <td className="w-24 px-3 py-2">
                        <Badge tone="danger">{issue.keyword}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{issue.path}</td>
                      <td className="break-all px-3 py-2">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            {result.truncated ? <p className="px-3 py-2 text-sm text-muted-foreground">Showing the first {result.issues.length} of {result.total} problems.</p> : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
