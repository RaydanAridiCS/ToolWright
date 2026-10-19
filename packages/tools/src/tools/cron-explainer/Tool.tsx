"use client";

import { useMemo } from "react";
import { Alert, Button, Field, Input, Panel, SegmentedControl, useShareableState } from "@toolwright/ui";
import { CRON_EXAMPLES, explainCron, nextRuns } from "@toolwright/core/cron";
import { errorMessage } from "../../shared/format";

const FIELD_LABELS = ["minute", "hour", "day of month", "month", "day of week"];

export default function Tool() {
  const { state, setState } = useShareableState({ expression: "*/15 9-17 * * 1-5", zone: "utc" as "utc" | "local" });
  const expression = state.expression.trim();

  const result = useMemo(() => {
    if (!expression) return null;
    try {
      const explanation = explainCron(expression);
      const runs = nextRuns(expression, 10, new Date(), { utc: state.zone === "utc" });
      return { ok: true as const, explanation, runs };
    } catch (err) {
      return { ok: false as const, error: errorMessage(err) };
    }
  }, [expression, state.zone]);

  const fmt = (d: Date) =>
    state.zone === "utc"
      ? d.toISOString().replace("T", " ").replace(/:\d\d\.\d+Z$/, " UTC")
      : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <Field label="Cron expression" hint="Five fields: minute hour day-of-month month day-of-week. Shortcuts like @daily also work.">
          {(id) => <Input id={id} mono className="h-12 text-base" value={state.expression} onChange={(e) => setState((s) => ({ ...s, expression: e.target.value }))} placeholder="*/15 * * * *" />}
        </Field>
        <div className="mt-3 grid grid-cols-5 gap-1.5 text-center font-mono text-[11px] text-muted-foreground" aria-hidden>
          {FIELD_LABELS.map((l) => (
            <span key={l} className="rounded bg-muted px-1 py-1">{l}</span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CRON_EXAMPLES.map((ex) => (
            <Button key={ex.expression} size="sm" variant="outline" onClick={() => setState((s) => ({ ...s, expression: ex.expression }))}>
              {ex.label}
            </Button>
          ))}
        </div>
      </div>

      {result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}

      {result?.ok ? (
        <>
          <div className="rounded-xl border border-primary/30 bg-primary/8 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">In plain English</p>
            <p className="mt-1 text-xl font-semibold">{result.explanation}</p>
          </div>
          <Panel
            title="Next 10 runs"
            actions={
              <SegmentedControl
                label="Time zone"
                value={state.zone}
                onValueChange={(zone) => setState((s) => ({ ...s, zone }))}
                options={[
                  { value: "utc", label: "UTC" },
                  { value: "local", label: "My time zone" },
                ]}
              />
            }
          >
            {result.runs.length === 0 ? (
              <Alert tone="warning">This schedule does not run in the next several years.</Alert>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2">
                {result.runs.map((d, i) => (
                  <li key={d.toISOString()} className="flex items-baseline gap-3 rounded-lg border border-border bg-card px-3.5 py-2 font-mono text-sm">
                    <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                    {fmt(d)}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
