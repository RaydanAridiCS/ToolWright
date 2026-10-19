"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { base64Decode, base64Encode } from "@toolwright/core/encoding";

const PARAM = "s";
/** Browsers handle long URLs, but shared links should stay pasteable. */
export const MAX_SHARE_LENGTH = 6000;

export function encodeShareState(value: unknown): string {
  return base64Encode(JSON.stringify(value), { urlSafe: true, padding: false });
}

export function decodeShareState<T>(encoded: string): T | null {
  try {
    return JSON.parse(base64Decode(encoded)) as T;
  } catch {
    return null;
  }
}

function readHash(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get(PARAM);
}

export interface ShareableState<T> {
  state: T;
  setState: (next: T | ((prev: T) => T)) => void;
  /** Absolute URL that reproduces the current state, or null if it is too long or unchanged. */
  shareUrl: string | null;
  /** True once any saved state in the URL has been applied. */
  ready: boolean;
}

/**
 * React state mirrored into the URL *hash* so a tool's input and options can be shared as a link.
 * The hash never leaves the browser: it is not part of HTTP requests.
 */
export function useShareableState<T extends object>(
  initial: T,
  options: {
    enabled?: boolean;
    debounceMs?: number;
    /** Keys that must never be written to (or read from) the URL, e.g. passwords. They stay in component state only. */
    exclude?: readonly (keyof T)[];
  } = {},
): ShareableState<T> {
  const { enabled = true, debounceMs = 400, exclude = [] } = options;
  const excludeRef = useRef(exclude);
  const initialRef = useRef(initial);
  const [state, setState] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Restore from the URL once, after hydration.
  useEffect(() => {
    if (enabled) {
      const encoded = readHash();
      const restored = encoded ? decodeShareState<Partial<T>>(encoded) : null;
      if (restored && typeof restored === "object") {
        const safe = { ...restored };
        for (const key of excludeRef.current) delete safe[key];
        setState({ ...initialRef.current, ...safe });
      }
    }
    setReady(true);
  }, [enabled]);

  // Write changes back (debounced).
  useEffect(() => {
    if (!enabled || !ready) return;
    const timer = setTimeout(() => {
      const without = (value: T): Partial<T> => {
        const copy = { ...value };
        for (const key of excludeRef.current) delete copy[key];
        return copy;
      };
      const unchanged = JSON.stringify(without(state)) === JSON.stringify(without(initialRef.current));
      const encoded = unchanged ? "" : encodeShareState(without(state));
      const tooLong = encoded.length > MAX_SHARE_LENGTH;
      const url = new URL(window.location.href);
      url.hash = encoded && !tooLong ? `${PARAM}=${encoded}` : "";
      window.history.replaceState(window.history.state, "", url);
      setShareUrl(encoded && !tooLong ? url.toString() : null);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [state, enabled, ready, debounceMs]);

  const set = useCallback((next: T | ((prev: T) => T)) => setState(next), []);
  return { state, setState: set, shareUrl, ready };
}
