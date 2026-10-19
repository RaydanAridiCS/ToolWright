"use client";

import { nanoid } from "@toolwright/core/ids";

/**
 * Browser-side client for the tool-request board.
 * Visitors are identified by a random token kept in localStorage. It is hashed server-side and
 * is not linked to any account, email or IP address.
 */

export type Status = "open" | "planned" | "building" | "shipped" | "declined";

export interface RequestItem {
  id: string;
  title: string;
  description: string;
  status: Status;
  createdAt: string;
  votes: number;
  hasVoted: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "tw-token";
let memoryToken: string | null = null;

export function getToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
    const created = nanoid(32);
    localStorage.setItem(TOKEN_KEY, created);
    return created;
  } catch {
    return (memoryToken ??= nanoid(32)); // storage blocked: token lasts for this page view
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "x-tw-token": getToken(), ...init.headers },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: { code: string; message: string; details?: Record<string, unknown> } }) | null;
  if (!response.ok) {
    const e = body?.error;
    throw new ApiError(e?.message ?? "Something went wrong. Please try again.", e?.code ?? "unknown", response.status, e?.details);
  }
  return body as T;
}

export const requestsApi = {
  list: (sort: "top" | "new", status?: Status) =>
    call<{ requests: RequestItem[]; persistent: boolean }>(`/api/requests?sort=${sort}${status ? `&status=${status}` : ""}`),
  create: (input: { title: string; description: string; website?: string }) => call<{ request: RequestItem }>("/api/requests", { method: "POST", body: JSON.stringify(input) }),
  vote: (id: string) => call<{ votes: number; hasVoted: boolean }>(`/api/requests/${id}/vote`, { method: "POST" }),
  unvote: (id: string) => call<{ votes: number; hasVoted: boolean }>(`/api/requests/${id}/vote`, { method: "DELETE" }),
};
