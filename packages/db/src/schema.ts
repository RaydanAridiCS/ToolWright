import { char, index, pgEnum, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const REQUEST_STATUSES = ["open", "planned", "building", "shipped", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const requestStatus = pgEnum("request_status", REQUEST_STATUSES);

/**
 * Tool requests submitted from the public board.
 * No accounts: creators and voters are identified only by a SHA-256 hash of a random token
 * generated in their browser, so there is no email, IP address or other personal data here.
 */
export const toolRequests = pgTable(
  "tool_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 120 }).notNull(),
    /** Lower-cased, whitespace-collapsed title, used to reject duplicates. */
    normalizedTitle: varchar("normalized_title", { length: 120 }).notNull().unique(),
    description: text("description").notNull().default(""),
    status: requestStatus("status").notNull().default("open"),
    creatorHash: char("creator_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tool_requests_status_idx").on(t.status), index("tool_requests_creator_idx").on(t.creatorHash, t.createdAt)],
);

export const toolRequestVotes = pgTable(
  "tool_request_votes",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => toolRequests.id, { onDelete: "cascade" }),
    voterHash: char("voter_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.voterHash] })],
);

export type ToolRequestRow = typeof toolRequests.$inferSelect;
export type NewToolRequestRow = typeof toolRequests.$inferInsert;
