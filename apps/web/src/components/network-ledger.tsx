"use client";

import Link from "next/link";
import { cn } from "@toolwright/ui";
import { useOutsideRequests } from "../lib/use-outside-requests";

/**
 * The privacy claim as a live instrument: how many requests this page has sent to other servers, measured by your browser.
 * It reads "…" until the browser has actually measured, and goes red if it ever finds one.
 */
export function NetworkLedger({ className, showSameOrigin = false, link = true }: { className?: string; showSameOrigin?: boolean; link?: boolean }) {
  const { ready, outside, same } = useOutsideRequests();
  const clean = ready && outside === 0;
  return (
    <span className={cn("label-plate inline-flex flex-wrap items-center gap-x-2 gap-y-0.5", className)} aria-live="polite">
      <span aria-hidden className={cn("inline-block size-2 border border-foreground", !ready ? "bg-muted" : clean ? "bg-primary" : "bg-danger")} />
      <span>
        Outside requests{" "}
        <strong data-testid="outside-requests" className={cn("tick font-bold", ready && !clean ? "text-danger" : "text-foreground")} key={ready ? outside : "pending"}>
          {ready ? outside : "…"}
        </strong>
      </span>
      {showSameOrigin && ready ? <span>· {same} files from this site</span> : null}
      {link ? (
        <Link href="/privacy#verify" className="text-foreground underline decoration-1 underline-offset-2 hover:bg-marker hover:text-marker-foreground">
          How to check
        </Link>
      ) : null}
    </span>
  );
}
