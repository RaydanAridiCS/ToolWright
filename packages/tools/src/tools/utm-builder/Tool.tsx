"use client";

import { useMemo } from "react";
import { Alert, CopyButton, Field, Input, Panel, Textarea, useShareableState } from "@toolwright/ui";
import { addUtm } from "@toolwright/core/url";

export default function Tool() {
  const { state, setState } = useShareableState({ url: "https://example.com/pricing", source: "newsletter", medium: "email", campaign: "spring-launch", term: "", content: "" });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  const result = useMemo(() => {
    if (!state.url.trim()) return null;
    try {
      const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(state.url.trim()) ? state.url.trim() : `https://${state.url.trim()}`;
      return { ok: true as const, link: addUtm(url, { source: state.source.trim(), medium: state.medium.trim(), campaign: state.campaign.trim(), term: state.term.trim(), content: state.content.trim() }) };
    } catch {
      return { ok: false as const };
    }
  }, [state]);

  const missing = !state.source.trim() || !state.medium.trim() || !state.campaign.trim();

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Website URL" className="sm:col-span-2">
          {(id) => <Input id={id} mono value={state.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/page" />}
        </Field>
        <Field label="Campaign source *" hint="Where the traffic comes from: newsletter, twitter, google">
          {(id) => <Input id={id} value={state.source} onChange={(e) => set({ source: e.target.value })} />}
        </Field>
        <Field label="Campaign medium *" hint="Marketing channel: email, cpc, social">
          {(id) => <Input id={id} value={state.medium} onChange={(e) => set({ medium: e.target.value })} />}
        </Field>
        <Field label="Campaign name *" hint="Product, promo or slogan">
          {(id) => <Input id={id} value={state.campaign} onChange={(e) => set({ campaign: e.target.value })} />}
        </Field>
        <Field label="Campaign term" hint="Paid search keywords">
          {(id) => <Input id={id} value={state.term} onChange={(e) => set({ term: e.target.value })} />}
        </Field>
        <Field label="Campaign content" hint="Differentiate ads or links">
          {(id) => <Input id={id} value={state.content} onChange={(e) => set({ content: e.target.value })} />}
        </Field>
      </div>
      {missing ? <Alert tone="warning">Source, medium and campaign name are required by most analytics tools.</Alert> : null}
      {result && !result.ok ? <Alert tone="error">That URL could not be parsed.</Alert> : null}
      {result?.ok ? (
        <Panel title="Your tracked link" actions={<CopyButton text={result.link} />}>
          <Textarea aria-label="Tracked link" readOnly rows={3} value={result.link} className="break-all bg-muted/40" />
        </Panel>
      ) : null}
    </div>
  );
}
