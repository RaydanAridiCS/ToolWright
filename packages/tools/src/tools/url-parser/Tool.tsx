"use client";

import { useMemo } from "react";
import { Alert, Button, Field, Input, Panel, ScrollArea, useShareableState } from "@toolwright/ui";
import { parseUrl } from "@toolwright/core/url";
import { ResultRow } from "../../shared/result-row";

const SAMPLE = "https://user:secret@example.com:8080/path/to/page.html?utm_source=news&q=hello%20world&q=again#section-2";

export default function Tool() {
  const { state, setState } = useShareableState({ url: "" });
  const parsed = useMemo(() => parseUrl(state.url), [state.url]);

  return (
    <div className="flex flex-col gap-5">
      <Field label="URL">
        {(id) => (
          <div className="flex gap-2">
            <Input id={id} mono value={state.url} onChange={(e) => setState({ url: e.target.value })} placeholder="https://example.com/path?query=1#hash" />
            <Button variant="outline" onClick={() => setState({ url: SAMPLE })}>
              Sample
            </Button>
          </div>
        )}
      </Field>
      {state.url.trim() && !parsed ? <Alert tone="error">That does not look like a valid URL.</Alert> : null}
      {parsed ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ResultRow label="Protocol" value={parsed.protocol} />
            <ResultRow label="Host" value={parsed.host} />
            <ResultRow label="Hostname" value={parsed.hostname} />
            <ResultRow label="Port" value={parsed.port} hint={parsed.port ? undefined : "Default port for the protocol"} />
            <ResultRow label="Path" value={parsed.pathname} />
            <ResultRow label="Query string" value={parsed.search} />
            <ResultRow label="Fragment (hash)" value={parsed.hash} />
            <ResultRow label="Origin" value={parsed.origin} />
            {parsed.username ? <ResultRow label="Username" value={parsed.username} /> : null}
            {parsed.password ? <ResultRow label="Password" value={parsed.password} /> : null}
          </div>
          <Panel title={`Query parameters (${parsed.params.length})`}>
            {parsed.params.length === 0 ? (
              <p className="text-sm text-muted-foreground">This URL has no query parameters.</p>
            ) : (
              <ScrollArea label="Query parameters" className="rounded-xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Value (decoded)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono text-[13px]">
                    {parsed.params.map((p, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{p.key}</td>
                        <td className="break-all px-4 py-2">{p.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
