ALTER TABLE "routines" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_share_token_unique" UNIQUE("share_token");