-- `seq` is meant to be monotonic within a thread, but it was written as a read
-- of max(seq) followed by a separate insert. Two agents appending to one thread
-- both read the same max and both wrote it, so the column already holds
-- duplicates — which surface as `each_key_duplicate` once anything downstream
-- keys on them.
--
-- The writers now compute `seq` inside the insert. This renumbers what the old
-- ones left behind, then adds the indexes that stop it recurring. The
-- renumbering has to run first: the index cannot be built over the duplicates.

-- Renumber per thread, preserving the order already on screen. `created_at` and
-- `id` break ties between rows that collided, so the result is stable rather
-- than arbitrary.
WITH renumbered AS (
  SELECT id, row_number() OVER (PARTITION BY thread_id ORDER BY seq, created_at, id) AS n
  FROM entries
)
UPDATE entries e SET seq = r.n FROM renumbered r WHERE e.id = r.id AND e.seq <> r.n;
--> statement-breakpoint
WITH renumbered AS (
  SELECT id, row_number() OVER (PARTITION BY thread_id ORDER BY seq, created_at, id) AS n
  FROM steps
)
UPDATE steps s SET seq = r.n FROM renumbered r WHERE s.id = r.id AND s.seq <> r.n;
--> statement-breakpoint
CREATE UNIQUE INDEX "entries_thread_seq" ON "entries" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "steps_thread_seq" ON "steps" USING btree ("thread_id","seq");
