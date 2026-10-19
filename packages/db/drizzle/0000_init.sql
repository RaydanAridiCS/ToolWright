CREATE TYPE "public"."request_status" AS ENUM('open', 'planned', 'building', 'shipped', 'declined');--> statement-breakpoint
CREATE TABLE "tool_request_votes" (
	"request_id" uuid NOT NULL,
	"voter_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_request_votes_request_id_voter_hash_pk" PRIMARY KEY("request_id","voter_hash")
);
--> statement-breakpoint
CREATE TABLE "tool_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"normalized_title" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"creator_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_requests_normalized_title_unique" UNIQUE("normalized_title")
);
--> statement-breakpoint
ALTER TABLE "tool_request_votes" ADD CONSTRAINT "tool_request_votes_request_id_tool_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tool_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_requests_status_idx" ON "tool_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tool_requests_creator_idx" ON "tool_requests" USING btree ("creator_hash","created_at");