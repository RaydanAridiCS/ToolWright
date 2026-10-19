import { DuplicateRequestError, normalizeTitle, type ListOptions, type NewToolRequest, type RequestStatus, type ToolRequest, type ToolRequestRepository, type VoteResult } from "./repository";

interface Stored {
  id: string;
  title: string;
  normalizedTitle: string;
  description: string;
  status: RequestStatus;
  creatorHash: string;
  createdAt: Date;
  voters: Set<string>;
}

/** Volatile repository used when no database is configured, and for fast tests. */
export class InMemoryToolRequestRepository implements ToolRequestRepository {
  readonly persistent = false;
  private readonly rows = new Map<string, Stored>();

  constructor(private readonly now: () => Date = () => new Date(), private readonly newId: () => string = () => crypto.randomUUID()) {}

  private view(row: Stored, voterHash?: string): ToolRequest {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      votes: row.voters.size,
      hasVoted: voterHash ? row.voters.has(voterHash) : false,
    };
  }

  async list({ status, sort = "top", limit = 50, offset = 0, voterHash }: ListOptions = {}): Promise<ToolRequest[]> {
    return [...this.rows.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => (sort === "new" ? b.createdAt.getTime() - a.createdAt.getTime() : b.voters.size - a.voters.size || b.createdAt.getTime() - a.createdAt.getTime()))
      .slice(offset, offset + limit)
      .map((r) => this.view(r, voterHash));
  }

  async getById(id: string, voterHash?: string): Promise<ToolRequest | null> {
    const row = this.rows.get(id);
    return row ? this.view(row, voterHash) : null;
  }

  async create(input: NewToolRequest): Promise<ToolRequest> {
    const normalizedTitle = normalizeTitle(input.title);
    const existing = [...this.rows.values()].find((r) => r.normalizedTitle === normalizedTitle);
    if (existing) throw new DuplicateRequestError(existing.id);
    const row: Stored = {
      id: this.newId(),
      title: input.title.trim(),
      normalizedTitle,
      description: input.description,
      status: "open",
      creatorHash: input.creatorHash,
      createdAt: this.now(),
      voters: new Set(),
    };
    this.rows.set(row.id, row);
    return this.view(row);
  }

  async vote(requestId: string, voterHash: string): Promise<VoteResult | null> {
    const row = this.rows.get(requestId);
    if (!row) return null;
    const changed = !row.voters.has(voterHash);
    row.voters.add(voterHash);
    return { votes: row.voters.size, changed };
  }

  async unvote(requestId: string, voterHash: string): Promise<VoteResult | null> {
    const row = this.rows.get(requestId);
    if (!row) return null;
    const changed = row.voters.delete(voterHash);
    return { votes: row.voters.size, changed };
  }

  async countCreatedSince(creatorHash: string, since: Date): Promise<number> {
    return [...this.rows.values()].filter((r) => r.creatorHash === creatorHash && r.createdAt >= since).length;
  }

  async setStatus(id: string, status: RequestStatus): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row) return false;
    row.status = status;
    return true;
  }
}
