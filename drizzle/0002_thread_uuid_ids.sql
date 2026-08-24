-- Thread ids move from name slugs ('retrieval-eval') to UUIDs. The columns stay
-- `text`; only the values change. Renaming a thread no longer has to drag its
-- URL along, and two threads with the same name no longer collide.
--
-- Every child row points at a thread through an ON DELETE CASCADE foreign key,
-- which does not cascade updates, so each id is rewritten explicitly here. The
-- deferred constraints let the parent move before the children catch up.

SET CONSTRAINTS ALL DEFERRED;
--> statement-breakpoint

DO $$
DECLARE
  t RECORD;
  fresh text;
BEGIN
  FOR t IN SELECT id FROM threads LOOP
    -- A row that already holds a UUID is left alone, so re-running is a no-op.
    BEGIN
      PERFORM t.id::uuid;
      CONTINUE;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;

    fresh := gen_random_uuid()::text;

    UPDATE threads SET id = fresh WHERE id = t.id;
    UPDATE entries SET thread_id = fresh WHERE thread_id = t.id;
    UPDATE steps SET thread_id = fresh WHERE thread_id = t.id;
    UPDATE documents SET thread_id = fresh WHERE thread_id = t.id;
    UPDATE agents SET busy_thread_id = fresh WHERE busy_thread_id = t.id;
  END LOOP;
END $$;
