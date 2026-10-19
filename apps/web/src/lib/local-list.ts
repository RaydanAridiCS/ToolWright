"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed list store (favorites, recently used tools).
 * It is per-browser only: nothing here is ever sent to a server.
 */

export const FAVORITES_KEY = "tw-favorites";
export const RECENTS_KEY = "tw-recents";
const MAX_RECENTS = 8;

const EMPTY: readonly string[] = Object.freeze([]);
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: readonly string[] }>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode or blocked storage
  }
}

export function parseList(raw: string | null): readonly string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function snapshot(key: string): readonly string[] {
  const raw = readRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseList(raw);
  cache.set(key, { raw, value });
  return value;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === FAVORITES_KEY || e.key === RECENTS_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeList(key: string, list: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage unavailable: keep working in memory for this session
    cache.set(key, { raw: JSON.stringify(list), value: Object.freeze([...list]) });
  }
  listeners.forEach((l) => l());
}

export function useLocalList(key: string): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY,
  );
}

export function toggleFavorite(slug: string): void {
  const current = snapshot(FAVORITES_KEY);
  writeList(FAVORITES_KEY, current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
}

export function pushRecent(slug: string): void {
  const current = snapshot(RECENTS_KEY);
  if (current[0] === slug) return;
  writeList(RECENTS_KEY, [slug, ...current.filter((s) => s !== slug)].slice(0, MAX_RECENTS));
}

export function clearList(key: string): void {
  writeList(key, []);
}
