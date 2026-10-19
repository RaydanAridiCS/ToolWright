"use client";

import { useSyncExternalStore } from "react";

/**
 * Live count of requests this page has made to *other* origins, measured with the browser's Resource Timing API.
 *
 * What it can show: every script, style, font, image, fetch and XHR the page loaded, split into "from this site"
 * and "from somewhere else". Requests the Content Security Policy blocks never leave the device and never appear.
 * What it cannot show: request bodies, WebSockets, or anything from other tabs. It complements the DevTools check
 * described on /privacy; it does not replace it.
 */

export interface LoggedRequest {
  url: string;
  type: string;
  size: number;
  outside: boolean;
}

export interface RequestStats {
  /** False until the browser has been asked (so the server never claims a number it did not measure). */
  ready: boolean;
  outside: number;
  same: number;
  /** Most recent entries, newest last. */
  log: readonly LoggedRequest[];
}

const MAX_LOG = 200;
const SERVER: RequestStats = Object.freeze({ ready: false, outside: 0, same: 0, log: Object.freeze([]) as readonly LoggedRequest[] });

/** Decide whether a Resource Timing URL counts as an outside request. `null` means "ignore" (data:, blob:, …). */
export function classify(url: string, origin: string): "same" | "outside" | null {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.origin === origin ? "same" : "outside";
}

let state: RequestStats = SERVER;
let started = false;
const listeners = new Set<() => void>();

function publish(next: RequestStats) {
  state = next;
  listeners.forEach((l) => l());
}

function ingest(entries: readonly PerformanceEntry[]) {
  const origin = window.location.origin;
  let outside = state.outside;
  let same = state.same;
  const log = [...state.log];
  for (const entry of entries) {
    const kind = classify(entry.name, origin);
    if (!kind) continue;
    const resource = entry as PerformanceResourceTiming;
    if (kind === "outside") outside++;
    else same++;
    log.push({ url: entry.name, type: resource.initiatorType || "other", size: resource.transferSize || resource.encodedBodySize || 0, outside: kind === "outside" });
  }
  publish({ ready: true, outside, same, log: Object.freeze(log.slice(-MAX_LOG)) });
}

/** Test seam: feed entries without a real PerformanceObserver. */
export function __ingestForTests(entries: readonly PerformanceEntry[]) {
  ingest(entries);
}

export function __resetForTests() {
  started = false;
  state = SERVER;
  listeners.clear();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (typeof PerformanceObserver === "undefined") {
    publish({ ...SERVER, ready: true });
    return;
  }
  try {
    new PerformanceObserver((list) => ingest(list.getEntries())).observe({ type: "resource", buffered: true });
    // Make sure we publish a first value even if nothing has loaded yet.
    publish({ ...state, ready: true });
  } catch {
    publish({ ...SERVER, ready: true });
  }
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOutsideRequests(): RequestStats {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}
