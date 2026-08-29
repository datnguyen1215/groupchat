ALTER TABLE "threads" ADD COLUMN "titled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Threads that already exist were named by a person, or left alone on purpose.
-- Either way the generator must not rename them on their next turn.
UPDATE "threads" SET "titled" = true;
