// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../src/app/api/requests/route";
import { DELETE, POST as VOTE } from "../src/app/api/requests/[id]/vote/route";

const TOKEN_A = "a".repeat(24);
const TOKEN_B = "b".repeat(24);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  // Fresh in-memory service for every test.
  delete (globalThis as { __toolwrightRequests?: unknown }).__toolwrightRequests;
  delete process.env.DATABASE_URL;
});

const req = (path: string, init: RequestInit & { token?: string } = {}) => {
  const { token, ...rest } = init;
  return new Request(`http://localhost${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(token ? { "x-tw-token": token } : {}), ...(rest.headers as Record<string, string> | undefined) },
  });
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const create = (body: unknown, token: string | null = TOKEN_A) => POST(req("/api/requests", { method: "POST", body: JSON.stringify(body), token: token ?? undefined }));

describe("GET /api/requests", () => {
  it("returns the seeded ideas in demo mode, sorted, with no-store caching", async () => {
    const res = await GET(req("/api/requests"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Json;
    expect(body.persistent).toBe(false);
    expect(body.requests.length).toBeGreaterThanOrEqual(3);
    expect(body.requests[0]).toEqual(expect.objectContaining({ id: expect.any(String), title: expect.any(String), votes: expect.any(Number), hasVoted: false, status: "open" }));
  });

  it("never exposes hashes or tokens", async () => {
    await create({ title: "Privacy preserving idea" });
    const text = await (await GET(req("/api/requests", { token: TOKEN_A }))).text();
    expect(text).not.toMatch(/creator|voter|hash/i);
    expect(text).not.toContain(TOKEN_A);
  });

  it("clamps limit, ignores bad parameters and supports sorting", async () => {
    const small = (await (await GET(req("/api/requests?limit=2"))).json()) as Json;
    expect(small.requests).toHaveLength(2);
    const huge = (await (await GET(req("/api/requests?limit=99999&sort=bogus&status=nope&offset=-5"))).json()) as Json;
    expect(huge.requests.length).toBeGreaterThan(0);
    const newest = (await (await GET(req("/api/requests?sort=new"))).json()) as Json;
    expect(newest.requests.length).toBeGreaterThan(0);
  });

  it("reports which ideas the caller has voted for", async () => {
    const created = (await (await create({ title: "Voted idea here" })).json()) as Json;
    const mine = (await (await GET(req("/api/requests", { token: TOKEN_A }))).json()) as Json;
    expect(mine.requests.find((r: Json) => r.id === created.request.id).hasVoted).toBe(true);
    const theirs = (await (await GET(req("/api/requests", { token: TOKEN_B }))).json()) as Json;
    expect(theirs.requests.find((r: Json) => r.id === created.request.id).hasVoted).toBe(false);
  });
});

describe("POST /api/requests", () => {
  it("creates an idea that starts with the creator's vote", async () => {
    const res = await create({ title: "  Regex visualizer  ", description: "Draw railroad diagrams" });
    expect(res.status).toBe(201);
    const { request } = (await res.json()) as Json;
    expect(request).toMatchObject({ title: "Regex visualizer", description: "Draw railroad diagrams", votes: 1, hasVoted: true, status: "open" });
  });

  it("validates input", async () => {
    for (const [body, pattern] of [
      [{ title: "x" }, /at least 4/],
      [{ title: "y".repeat(121) }, /120/],
      [{ title: "see https://spam.example" }, /links/],
      [{ title: "Valid title", description: "z".repeat(1001) }, /1,000/],
    ] as const) {
      const res = await create(body);
      expect(res.status).toBe(400);
      const json = (await res.json()) as Json;
      expect(json.error.code).toBe("invalid");
      expect(json.error.message).toMatch(pattern);
    }
  });

  it("requires a browser token", async () => {
    const res = await create({ title: "No token provided" }, null);
    expect(res.status).toBe(400);
    expect(((await res.json()) as Json).error.message).toMatch(/token/i);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const bad = await POST(req("/api/requests", { method: "POST", body: "{nope", token: TOKEN_A }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Json).error.message).toMatch(/JSON/);
    const big = await POST(req("/api/requests", { method: "POST", body: JSON.stringify({ title: "a".repeat(20_000) }), token: TOKEN_A }));
    expect(big.status).toBe(413);
  });

  it("treats the honeypot as spam", async () => {
    expect((await create({ title: "Looks legitimate", website: "http://spam.example" })).status).toBe(400);
  });

  it("rejects duplicates with the existing id, ignoring case", async () => {
    const first = (await (await create({ title: "Color blindness simulator" })).json()) as Json;
    const res = await create({ title: "COLOR  blindness simulator" }, TOKEN_B);
    expect(res.status).toBe(409);
    const json = (await res.json()) as Json;
    expect(json.error).toMatchObject({ code: "duplicate", details: { existingId: first.request.id } });
  });

  it("rate limits a browser to three new ideas per day", async () => {
    for (let i = 1; i <= 3; i++) expect((await create({ title: `Rate limited idea ${i}` })).status).toBe(201);
    const res = await create({ title: "Rate limited idea 4" });
    expect(res.status).toBe(429);
    expect(((await res.json()) as Json).error.code).toBe("rate_limited");
    expect((await create({ title: "Rate limited idea 4" }, TOKEN_B)).status).toBe(201);
  });
});

describe("vote endpoints", () => {
  async function idea() {
    return ((await (await create({ title: `Idea ${Math.random().toString(36).slice(2)}` })).json()) as Json).request as Json;
  }

  it("adds a vote idempotently and removes it again", async () => {
    const { id } = await idea();
    const first = (await (await VOTE(req(`/api/requests/${id}/vote`, { method: "POST", token: TOKEN_B }), ctx(id))).json()) as Json;
    expect(first).toEqual({ votes: 2, hasVoted: true });
    const again = (await (await VOTE(req(`/api/requests/${id}/vote`, { method: "POST", token: TOKEN_B }), ctx(id))).json()) as Json;
    expect(again.votes).toBe(2);
    const removed = (await (await DELETE(req(`/api/requests/${id}/vote`, { method: "DELETE", token: TOKEN_B }), ctx(id))).json()) as Json;
    expect(removed).toEqual({ votes: 1, hasVoted: false });
  });

  it("returns 404 for unknown ideas and 400 without a token", async () => {
    const missing = await VOTE(req("/api/requests/x/vote", { method: "POST", token: TOKEN_A }), ctx("00000000-0000-4000-8000-000000000000"));
    expect(missing.status).toBe(404);
    const { id } = await idea();
    const noToken = await VOTE(req(`/api/requests/${id}/vote`, { method: "POST" }), ctx(id));
    expect(noToken.status).toBe(400);
  });
});
