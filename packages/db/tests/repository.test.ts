import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleToolRequestRepository, DuplicateRequestError, InMemoryToolRequestRepository, normalizeTitle, type ToolRequestRepository } from "../src";
import * as schema from "../src/schema";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

let pg: PGlite;
let counter = 0;

beforeAll(async () => {
  pg = new PGlite();
  await migrate(drizzle(pg, { schema }), { migrationsFolder });
});
afterAll(async () => pg.close());

const factories: [string, () => Promise<ToolRequestRepository>][] = [
  ["in-memory", async () => new InMemoryToolRequestRepository()],
  [
    "drizzle + postgres (PGlite)",
    async () => {
      // Fresh data for each test, same migrated schema.
      await pg.exec("truncate table tool_request_votes, tool_requests cascade");
      return new DrizzleToolRequestRepository(drizzle(pg, { schema }));
    },
  ],
];

describe.each(factories)("ToolRequestRepository contract: %s", (_name, make) => {
  const input = (title = `Idea ${++counter}`, creatorHash = HASH_A) => ({ title, description: `About ${title}`, creatorHash });

  it("reports whether it persists", async () => {
    const repo = await make();
    expect(repo.persistent).toBe(_name !== "in-memory");
  });

  it("creates a request that starts open with zero votes", async () => {
    const repo = await make();
    const created = await repo.create(input("PDF compressor"));
    expect(created).toMatchObject({ title: "PDF compressor", description: "About PDF compressor", status: "open", votes: 0, hasVoted: false });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await repo.getById(created.id)).toMatchObject({ id: created.id, title: "PDF compressor" });
  });

  it("trims titles", async () => {
    const repo = await make();
    expect((await repo.create(input("  Spaced  "))).title).toBe("Spaced");
  });

  it("rejects duplicate titles, ignoring case and spacing", async () => {
    const repo = await make();
    const first = await repo.create(input("Markdown to PDF"));
    const dupe = repo.create(input("  markdown   TO pdf "));
    await expect(dupe).rejects.toBeInstanceOf(DuplicateRequestError);
    await expect(dupe).rejects.toMatchObject({ existingId: first.id });
  });

  it("returns null for unknown or malformed ids", async () => {
    const repo = await make();
    expect(await repo.getById("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await repo.getById("not-a-uuid")).toBeNull();
  });

  it("counts each voter once", async () => {
    const repo = await make();
    const { id } = await repo.create(input());
    expect(await repo.vote(id, HASH_A)).toEqual({ votes: 1, changed: true });
    expect(await repo.vote(id, HASH_A)).toEqual({ votes: 1, changed: false });
    expect(await repo.vote(id, HASH_B)).toEqual({ votes: 2, changed: true });
    expect((await repo.getById(id))?.votes).toBe(2);
  });

  it("removes votes", async () => {
    const repo = await make();
    const { id } = await repo.create(input());
    await repo.vote(id, HASH_A);
    await repo.vote(id, HASH_B);
    expect(await repo.unvote(id, HASH_A)).toEqual({ votes: 1, changed: true });
    expect(await repo.unvote(id, HASH_A)).toEqual({ votes: 1, changed: false });
  });

  it("returns null when voting on something that does not exist", async () => {
    const repo = await make();
    expect(await repo.vote("00000000-0000-4000-8000-000000000000", HASH_A)).toBeNull();
    expect(await repo.unvote("00000000-0000-4000-8000-000000000000", HASH_A)).toBeNull();
    expect(await repo.vote("garbage", HASH_A)).toBeNull();
  });

  it("tells each voter whether they have voted", async () => {
    const repo = await make();
    const { id } = await repo.create(input());
    await repo.vote(id, HASH_A);
    expect((await repo.getById(id, HASH_A))?.hasVoted).toBe(true);
    expect((await repo.getById(id, HASH_B))?.hasVoted).toBe(false);
    expect((await repo.getById(id))?.hasVoted).toBe(false);
    expect((await repo.list({ voterHash: HASH_A }))[0]?.hasVoted).toBe(true);
  });

  it("sorts by votes (top) or recency (new)", async () => {
    const repo = await make();
    const a = await repo.create(input("Alpha"));
    await new Promise((r) => setTimeout(r, 5));
    const b = await repo.create(input("Bravo"));
    await new Promise((r) => setTimeout(r, 5));
    const c = await repo.create(input("Charlie"));
    await repo.vote(a.id, HASH_A);
    await repo.vote(a.id, HASH_B);
    await repo.vote(b.id, HASH_A);

    expect((await repo.list({ sort: "top" })).map((r) => r.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect((await repo.list({ sort: "new" })).map((r) => r.title)).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect((await repo.list({ sort: "top" })).map((r) => r.votes)).toEqual([2, 1, 0]);
    void c;
  });

  it("supports limit and offset", async () => {
    const repo = await make();
    for (const t of ["One", "Two", "Three", "Four"]) {
      await repo.create(input(t));
      await new Promise((r) => setTimeout(r, 3));
    }
    expect((await repo.list({ sort: "new", limit: 2 })).map((r) => r.title)).toEqual(["Four", "Three"]);
    expect((await repo.list({ sort: "new", limit: 2, offset: 2 })).map((r) => r.title)).toEqual(["Two", "One"]);
  });

  it("filters by status and updates it", async () => {
    const repo = await make();
    const a = await repo.create(input("Planned thing"));
    await repo.create(input("Open thing"));
    expect(await repo.setStatus(a.id, "planned")).toBe(true);
    expect(await repo.setStatus("00000000-0000-4000-8000-000000000000", "planned")).toBe(false);
    expect((await repo.list({ status: "planned" })).map((r) => r.title)).toEqual(["Planned thing"]);
    expect((await repo.list({ status: "open" })).map((r) => r.title)).toEqual(["Open thing"]);
    expect((await repo.getById(a.id))?.status).toBe("planned");
  });

  it("counts requests created by a creator within a window", async () => {
    const repo = await make();
    await repo.create(input("From A 1", HASH_A));
    await repo.create(input("From A 2", HASH_A));
    await repo.create(input("From B", HASH_B));
    const dayAgo = new Date(Date.now() - 86_400_000);
    expect(await repo.countCreatedSince(HASH_A, dayAgo)).toBe(2);
    expect(await repo.countCreatedSince(HASH_B, dayAgo)).toBe(1);
    expect(await repo.countCreatedSince(HASH_C, dayAgo)).toBe(0);
    expect(await repo.countCreatedSince(HASH_A, new Date(Date.now() + 60_000))).toBe(0);
  });
});

describe("normalizeTitle", () => {
  it("lower-cases and collapses whitespace", () => {
    expect(normalizeTitle("  Hello   World\t!")).toBe("hello world !");
  });
});

describe("Postgres schema", () => {
  it("cascades vote deletion when a request is deleted", async () => {
    await pg.exec("truncate table tool_request_votes, tool_requests cascade");
    const repo = new DrizzleToolRequestRepository(drizzle(pg, { schema }));
    const { id } = await repo.create({ title: "Cascade test", description: "", creatorHash: HASH_A });
    await repo.vote(id, HASH_B);
    await pg.query("delete from tool_requests where id = $1", [id]);
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from tool_request_votes");
    expect(rows[0]?.n).toBe(0);
  });
  it("enforces the status enum", async () => {
    await expect(pg.query("insert into tool_requests (title, normalized_title, creator_hash, status) values ('x', 'x', $1, 'bogus')", [HASH_A])).rejects.toThrow();
  });
});
