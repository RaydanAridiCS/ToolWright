import { describe, expect, it } from "vitest";
import { InMemoryToolRequestRepository, RequestService, ServiceError, hashToken } from "../src";

const TOKEN_A = "token-aaaaaaaaaaaaaaaa";
const TOKEN_B = "token-bbbbbbbbbbbbbbbb";

function setup(options: ConstructorParameters<typeof RequestService>[1] = {}) {
  const repo = new InMemoryToolRequestRepository();
  return { repo, service: new RequestService(repo, options) };
}

describe("hashToken", () => {
  it("is stable, 64 hex chars, and separated by purpose", async () => {
    const a = await hashToken(TOKEN_A, "voter");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(TOKEN_A, "voter")).toBe(a);
    expect(await hashToken(TOKEN_A, "creator")).not.toBe(a);
    expect(await hashToken(TOKEN_B, "voter")).not.toBe(a);
  });
});

describe("RequestService.create", () => {
  it("validates input with friendly messages", async () => {
    const { service } = setup();
    await expect(service.create({ title: "ab", token: TOKEN_A })).rejects.toThrow(/at least 4/);
    await expect(service.create({ title: "x".repeat(121), token: TOKEN_A })).rejects.toThrow(/under 120/);
    await expect(service.create({ title: "See https://spam.example", token: TOKEN_A })).rejects.toThrow(/links/);
    await expect(service.create({ title: "Good title", description: "y".repeat(1001), token: TOKEN_A })).rejects.toThrow(/1,000/);
    await expect(service.create({ title: "Good title", token: "short" })).rejects.toThrow(/token/);
    await expect(service.create({ title: "Good title" })).rejects.toThrow("Missing or invalid browser token.");
    await expect(service.create({ token: TOKEN_A })).rejects.toThrow(/short title/);
    await expect(service.vote("00000000-0000-4000-8000-000000000000", {})).rejects.toThrow("Missing or invalid browser token.");
    await expect(service.create(null)).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects submissions that fill the honeypot", async () => {
    const { service } = setup();
    await expect(service.create({ title: "Bot made this", token: TOKEN_A, website: "http://spam" })).rejects.toBeInstanceOf(ServiceError);
  });

  it("creates a request with the creator's vote and trims text", async () => {
    const { service } = setup();
    const created = await service.create({ title: "  Regex visualizer  ", description: "  Show railroad diagrams  ", token: TOKEN_A });
    expect(created).toMatchObject({ title: "Regex visualizer", description: "Show railroad diagrams", votes: 1, hasVoted: true, status: "open" });
  });

  it("maps duplicates to a 409 with the existing id", async () => {
    const { service } = setup();
    const first = await service.create({ title: "Color blindness simulator", token: TOKEN_A });
    const err = await service.create({ title: "color blindness   SIMULATOR", token: TOKEN_B }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toMatchObject({ code: "duplicate", status: 409, details: { existingId: first.id } });
  });

  it("rate limits each browser token within the window", async () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const { service } = setup({ maxCreatesPerWindow: 2, now: () => now });
    await service.create({ title: "First idea here", token: TOKEN_A });
    await service.create({ title: "Second idea here", token: TOKEN_A });
    await expect(service.create({ title: "Third idea here", token: TOKEN_A })).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    // A different visitor is unaffected.
    await expect(service.create({ title: "Third idea here", token: TOKEN_B })).resolves.toBeTruthy();
  });
});

describe("RequestService.vote", () => {
  it("adds and removes a vote idempotently", async () => {
    const { service } = setup();
    const { id } = await service.create({ title: "Timezone meeting planner", token: TOKEN_A });
    expect(await service.vote(id, { token: TOKEN_B })).toEqual({ votes: 2, hasVoted: true });
    expect(await service.vote(id, { token: TOKEN_B })).toEqual({ votes: 2, hasVoted: true });
    expect(await service.vote(id, { token: TOKEN_B }, true)).toEqual({ votes: 1, hasVoted: false });
  });

  it("validates the token and the request", async () => {
    const { service } = setup();
    const { id } = await service.create({ title: "Another useful tool", token: TOKEN_A });
    await expect(service.vote(id, { token: "x" })).rejects.toMatchObject({ code: "invalid", status: 400 });
    await expect(service.vote("00000000-0000-4000-8000-000000000000", { token: TOKEN_B })).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});

describe("RequestService.list", () => {
  it("reports each visitor's own votes and caps the page size", async () => {
    const { service, repo } = setup();
    const a = await service.create({ title: "Alpha tool", token: TOKEN_A });
    await service.create({ title: "Bravo tool", token: TOKEN_B });
    const asA = await service.list({ token: TOKEN_A, sort: "new" });
    expect(asA.find((r) => r.id === a.id)?.hasVoted).toBe(true);
    expect(asA.find((r) => r.title === "Bravo tool")?.hasVoted).toBe(false);
    expect((await service.list()).every((r) => r.hasVoted === false)).toBe(true);
    expect((await service.list({ token: "bad token!" })).every((r) => !r.hasVoted)).toBe(true);
    for (let i = 0; i < 120; i++) await repo.create({ title: `Filler ${i}`, description: "", creatorHash: "f".repeat(64) });
    expect((await service.list({ limit: 500 })).length).toBe(100);
  });

  it("exposes whether data persists and lets maintainers change status", async () => {
    const { service } = setup();
    expect(service.persistent).toBe(false);
    const { id } = await service.create({ title: "Status test tool", token: TOKEN_A });
    await service.setStatus(id, "shipped");
    expect((await service.list({ status: "shipped" })).map((r) => r.id)).toEqual([id]);
    await expect(service.setStatus("00000000-0000-4000-8000-000000000000", "planned")).rejects.toMatchObject({ code: "not_found" });
  });
});
