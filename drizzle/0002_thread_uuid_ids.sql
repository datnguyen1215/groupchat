-- Thread ids move from name slugs ('retrieval-eval') to UUIDs. The columns stay
-- `text`; only the values change. Renaming a thread no longer has to drag its
-- URL along, and two threads with the same name no longer collide.
--
-- The foreign keys from entries/steps/documents are ON DELETE CASCADE but not
-- deferrable, so a thread's id cannot be updated in place while children still
-- reference it. Instead each thread is copied to a new row under its UUID, the
-- children are repointed at the copy, and the original row is deleted -- by
-- which time nothing references it, so the cascade has nothing to take with it.

DO $$
DECLARE
  t RECORD;
  fresh text;
BEGIN
  FOR t IN SELECT * FROM threads LOOP
    -- A row that already holds a UUID is left alone, so re-running is a no-op.
    BEGIN
      PERFORM t.id::uuid;
      CONTINUE;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;

    fresh := gen_random_uuid()::text;

    INSERT INTO threads (id, name, "group", live, unread, created_at, updated_at)
    VALUES (fresh, t.name, t."group", t.live, t.unread, t.created_at, t.updated_at);

    UPDATE entries   SET thread_id      = fresh WHERE thread_id      = t.id;
    UPDATE steps     SET thread_id      = fresh WHERE thread_id      = t.id;
    UPDATE documents SET thread_id      = fresh WHERE thread_id      = t.id;
    UPDATE agents    SET busy_thread_id = fresh WHERE busy_thread_id = t.id;

    DELETE FROM threads WHERE id = t.id;
  END LOOP;
END $$;
--> statement-breakpoint

-- Entry and step ids embedded the thread id ('retrieval-eval-e1'). They are
-- opaque UUIDs now, matching what appendMessage and appendStep write.
UPDATE entries SET id = gen_random_uuid()::text WHERE id !~* '^[0-9a-f-]{36}$';
--> statement-breakpoint
UPDATE steps   SET id = gen_random_uuid()::text WHERE id !~* '^[0-9a-f-]{36}$';
