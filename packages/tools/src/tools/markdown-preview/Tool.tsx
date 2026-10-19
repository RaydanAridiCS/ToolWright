"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Button, CopyButton, DownloadButton, Panel, SegmentedControl, Textarea, Toggle, useDebounced, useShareableState } from "@toolwright/ui";
import { markdownToHtml, tableOfContents } from "@toolwright/core/markdown";

const SAMPLE = `# Hello, Markdown

Write **bold**, *italic*, ~~strikethrough~~ and \`inline code\`.

## Lists
- [x] Task lists
- [ ] Tables
  1. Nested
  2. Items

| Tool | Runs where |
| ---- | ---------- |
| Toolwright | In your browser |

\`\`\`ts
const greet = (name: string) => \`Hi \${name}\`;
\`\`\`

> Blockquotes work too.
`;

export default function Tool() {
  const { state, setState } = useShareableState({ md: "", breaks: false, tab: "preview" as "preview" | "html" });
  const md = useDebounced(state.md, 150);
  const [html, setHtml] = useState("");

  // DOMPurify needs a DOM, so sanitise on the client after render.
  useEffect(() => {
    const raw = markdownToHtml(md, { breaks: state.breaks });
    setHtml(DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } }));
  }, [md, state.breaks]);

  const toc = tableOfContents(state.md);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="Markdown"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setState((s) => ({ ...s, md: SAMPLE }))}>
              Sample
            </Button>
            <CopyButton text={toc} label="Copy contents list" disabled={!toc} variant="ghost" />
          </>
        }
      >
        <Textarea aria-label="Markdown" rows={22} className="min-h-96" value={state.md} onChange={(e) => setState((s) => ({ ...s, md: e.target.value }))} placeholder="# Start writing…" />
        <Toggle label="Treat single line breaks as <br>" checked={state.breaks} onCheckedChange={(v) => setState((s) => ({ ...s, breaks: v }))} />
      </Panel>

      <Panel
        title={
          <SegmentedControl
            label="Output view"
            value={state.tab}
            onValueChange={(tab) => setState((s) => ({ ...s, tab }))}
            options={[
              { value: "preview", label: "Preview" },
              { value: "html", label: "HTML" },
            ]}
          />
        }
        actions={
          <>
            <CopyButton text={html} label="Copy HTML" />
            <DownloadButton data={html} filename="document.html" mime="text/html" />
          </>
        }
      >
        {state.tab === "preview" ? (
          <article
            aria-label="Preview"
            tabIndex={0}
            className="prose-tw min-h-96 overflow-auto rounded-lg border border-border bg-card p-5"
            dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground">The preview appears here.</p>' }}
          />
        ) : (
          <Textarea aria-label="Generated HTML" readOnly rows={22} className="min-h-96 bg-muted/40" value={html} />
        )}
      </Panel>
    </div>
  );
}
