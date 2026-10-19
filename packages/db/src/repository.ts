/**
 * The persistence contract for the tool-request board.
 * The web app depends only on this interface (repository pattern), so storage can be swapped freely.
 */

export type RequestStatus = "open" | "planned" | "building" | "shipped" | "declined";

export interface ToolRequest {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  createdAt: Date;
  votes: number;
  /** Whether the voter identified by `voterHash` (when given) has voted for this request. */
  hasVoted: boolean;
}

export interface NewToolRequest {
  title: string;
  description: string;
  /** SHA-256 hex of the creator's anonymous token. */
  creatorHash: string;
}

export interface ListOptions {
  status?: RequestStatus;
  sort?: "top" | "new";
  limit?: number;
  offset?: number;
  voterHash?: string;
}

export interface VoteResult {
  votes: number;
  /** `false` when the vote already existed (or did not exist, for removals). */
  changed: boolean;
}

export class DuplicateRequestError extends Error {
  constructor(readonly existingId?: string) {
    super("A request with this title already exists.");
    this.name = "DuplicateRequestError";
  }
}

export interface ToolRequestRepository {
  /** `false` for the in-memory fallback, which loses data on restart. */
  readonly persistent: boolean;
  list(options?: ListOptions): Promise<ToolRequest[]>;
  getById(id: string, voterHash?: string): Promise<ToolRequest | null>;
  /** Throws {@link DuplicateRequestError} when the normalized title is taken. */
  create(input: NewToolRequest): Promise<ToolRequest>;
  /** Returns `null` when the request does not exist. */
  vote(requestId: string, voterHash: string): Promise<VoteResult | null>;
  unvote(requestId: string, voterHash: string): Promise<VoteResult | null>;
  countCreatedSince(creatorHash: string, since: Date): Promise<number>;
  setStatus(id: string, status: RequestStatus): Promise<boolean>;
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}
