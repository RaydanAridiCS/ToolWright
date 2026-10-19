import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { toolRequestVotes, toolRequests, type RequestStatus as DbStatus } from "./schema";
import { DuplicateRequestError, normalizeTitle, type ListOptions, type NewToolRequest, type RequestStatus, type ToolRequest, type ToolRequestRepository, type VoteResult } from "./repository";

// Any Drizzle Postgres database works: postgres-js in production, PGlite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, any>;

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 4; depth++) {
    if (typeof current === "object" && "code" in current && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export class DrizzleToolRequestRepository implements ToolRequestRepository {
  readonly persistent = true;

  constructor(private readonly db: AnyPgDatabase) {}

  private voteCount() {
    return sql<number>`(select count(*)::int from ${toolRequestVotes} where ${toolRequestVotes.requestId} = ${toolRequests.id})`;
  }

  private hasVoted(voterHash?: string) {
    return voterHash
      ? sql<boolean>`exists (select 1 from ${toolRequestVotes} where ${toolRequestVotes.requestId} = ${toolRequests.id} and ${toolRequestVotes.voterHash} = ${voterHash})`
      : sql<boolean>`false`;
  }

  private columns(voterHash?: string) {
    return {
      id: toolRequests.id,
      title: toolRequests.title,
      description: toolRequests.description,
      status: toolRequests.status,
      createdAt: toolRequests.createdAt,
      votes: this.voteCount(),
      hasVoted: this.hasVoted(voterHash),
    };
  }

  async list({ status, sort = "top", limit = 50, offset = 0, voterHash }: ListOptions = {}): Promise<ToolRequest[]> {
    const rows = await this.db
      .select(this.columns(voterHash))
      .from(toolRequests)
      .where(status ? eq(toolRequests.status, status as DbStatus) : undefined)
      .orderBy(...(sort === "new" ? [desc(toolRequests.createdAt)] : [desc(this.voteCount()), desc(toolRequests.createdAt)]))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => ({ ...r, status: r.status as RequestStatus, votes: Number(r.votes), hasVoted: Boolean(r.hasVoted) }));
  }

  async getById(id: string, voterHash?: string): Promise<ToolRequest | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await this.db.select(this.columns(voterHash)).from(toolRequests).where(eq(toolRequests.id, id)).limit(1);
    return row ? { ...row, status: row.status as RequestStatus, votes: Number(row.votes), hasVoted: Boolean(row.hasVoted) } : null;
  }

  async create(input: NewToolRequest): Promise<ToolRequest> {
    const normalizedTitle = normalizeTitle(input.title);
    try {
      const [created] = await this.db
        .insert(toolRequests)
        .values({ title: input.title.trim(), normalizedTitle, description: input.description, creatorHash: input.creatorHash })
        .returning({ id: toolRequests.id });
      const found = created ? await this.getById(created.id) : null;
      if (!found) throw new Error("Insert did not return a row.");
      return found;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const [existing] = await this.db.select({ id: toolRequests.id }).from(toolRequests).where(eq(toolRequests.normalizedTitle, normalizedTitle)).limit(1);
        throw new DuplicateRequestError(existing?.id);
      }
      throw err;
    }
  }

  private async votesFor(requestId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(toolRequestVotes).where(eq(toolRequestVotes.requestId, requestId));
    return Number(row?.n ?? 0);
  }

  private async exists(id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    const [row] = await this.db.select({ id: toolRequests.id }).from(toolRequests).where(eq(toolRequests.id, id)).limit(1);
    return Boolean(row);
  }

  async vote(requestId: string, voterHash: string): Promise<VoteResult | null> {
    if (!(await this.exists(requestId))) return null;
    const inserted = await this.db.insert(toolRequestVotes).values({ requestId, voterHash }).onConflictDoNothing().returning({ id: toolRequestVotes.requestId });
    return { votes: await this.votesFor(requestId), changed: inserted.length > 0 };
  }

  async unvote(requestId: string, voterHash: string): Promise<VoteResult | null> {
    if (!(await this.exists(requestId))) return null;
    const removed = await this.db
      .delete(toolRequestVotes)
      .where(and(eq(toolRequestVotes.requestId, requestId), eq(toolRequestVotes.voterHash, voterHash)))
      .returning({ id: toolRequestVotes.requestId });
    return { votes: await this.votesFor(requestId), changed: removed.length > 0 };
  }

  async countCreatedSince(creatorHash: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(toolRequests)
      .where(and(eq(toolRequests.creatorHash, creatorHash), gte(toolRequests.createdAt, since)));
    return Number(row?.n ?? 0);
  }

  async setStatus(id: string, status: RequestStatus): Promise<boolean> {
    if (!(await this.exists(id))) return false;
    await this.db.update(toolRequests).set({ status: status as DbStatus }).where(eq(toolRequests.id, id));
    return true;
  }
}
