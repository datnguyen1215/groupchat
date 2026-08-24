import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';

/**
 * The append-only guarantee, checked against the real database.
 *
 * This is the bug the whole design exists to prevent: an agent speaking must
 * never overwrite what was already said. Posting is an INSERT at `max(seq) + 1`
 * and nothing updates an existing row, so a second message can only ever land
 * after the first.
 */

test.describe.configure({ mode: 'serial' });

const post = async (
  sql: ReturnType<typeof connect>,
  threadId: string,
  authorId: string,
  text: string
) => {
  const [{ next }] = await sql`
    select coalesce(max(seq), 0) + 1 as next from entries where thread_id = ${threadId}
  `;
  const id = `${threadId}-e${next}`;
  await sql`
    insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
    values (${id}, ${threadId}, 'message', ${next}, ${authorId}, ${sql.json([text])})
  `;
  return { id, seq: Number(next) };
};

test.describe('entries are append-only', () => {
  const threadId = 'append-only-thread';

  test.beforeEach(async () => {
    const sql = connect();
    try {
      await sql`insert into threads (id, name) values (${threadId}, 'Append only') on conflict do nothing`;
      await sql`delete from entries where thread_id = ${threadId}`;
    } finally {
      await sql.end();
    }
  });

  test('a second message is added after the first, not in place of it', async () => {
    const sql = connect();
    try {
      const first = await post(sql, threadId, 'you', 'first message');
      const second = await post(sql, threadId, 'kestrel', 'second message');

      expect(second.seq).toBeGreaterThan(first.seq);

      const rows = await sql`
        select paragraphs from entries where thread_id = ${threadId} order by seq
      `;
      expect(rows).toHaveLength(2);
      expect(rows.map(r => r.paragraphs[0])).toEqual(['first message', 'second message']);
    } finally {
      await sql.end();
    }
  });

  test('many messages from different authors all survive, in order', async () => {
    const sql = connect();
    try {
      const authors = ['you', 'orchestrator', 'kestrel', 'wren', 'kestrel'];
      for (const [i, author] of authors.entries()) await post(sql, threadId, author, `msg ${i}`);

      const rows = await sql`
        select author_id, paragraphs from entries where thread_id = ${threadId} order by seq
      `;
      expect(rows).toHaveLength(authors.length);
      expect(rows.map(r => r.author_id)).toEqual(authors);
      expect(rows.map(r => r.paragraphs[0])).toEqual(authors.map((_, i) => `msg ${i}`));
    } finally {
      await sql.end();
    }
  });
});

test.describe('presence is separate from the message stream', () => {
  /**
   * A busy agent is a row in `agents`, not an entry. That separation is what
   * lets the UI show "working…" without it later being replaced by a message.
   */
  test('marking an agent busy adds no entry to the thread', async () => {
    const sql = connect();
    try {
      const before = await sql`select count(*)::int as n from entries where thread_id = 'retrieval-eval'`;

      await sql`
        update agents set status = 'busy', status_label = 'Working',
          busy_thread_id = 'retrieval-eval' where id = 'wren'
      `;
      const after = await sql`select count(*)::int as n from entries where thread_id = 'retrieval-eval'`;

      expect(after[0].n).toBe(before[0].n);

      const [wren] = await sql`select status, status_label from agents where id = 'wren'`;
      expect(wren.status).toBe('busy');
      expect(wren.status_label).toBe('Working');
      await sql`
        update agents set status = 'idle', status_label = 'Idle',
          busy_thread_id = null where id = 'wren'
      `;
    } finally {
      await sql.end();
    }
  });
});

test.describe('a failed turn does not strand the agent', () => {
  /**
   * The loop resets status in a `finally`, so a failure clears it. A process
   * killed mid-turn never reaches that, which is what `clearStaleBusy` covers —
   * a busy row older than the cutoff is treated as abandoned.
   */
  const AGENT = 'stale-probe';

  test.beforeAll(async () => {
    const sql = connect();
    try {
      await sql`
        insert into agents (id, name, initials, color, kind, role)
        values (${AGENT}, 'Stale', 'S', '#7aa2ff', 'research', 'prober')
        on conflict (id) do nothing
      `;
    } finally {
      await sql.end();
    }
  });

  test('a busy row left by a crash is cleared on the next page load', async ({ page }) => {
    const sql = connect();
    try {
      /* Older than the five-minute cutoff: the mark of a turn nobody is running. */
      await sql`
        update agents
        set status = 'busy', status_label = 'Thinking',
            busy_thread_id = 'retrieval-eval',
            updated_at = now() - interval '30 minutes'
        where id = ${AGENT}
      `;

      await page.goto('/chats/retrieval-eval');

      const [row] = await sql`select status, busy_thread_id from agents where id = ${AGENT}`;
      expect(row.status).toBe('idle');
      expect(row.busy_thread_id).toBeNull();
    } finally {
      await sql.end();
    }
  });

  test('a turn that just started is left alone', async ({ page }) => {
    const sql = connect();
    try {
      await sql`
        update agents
        set status = 'busy', status_label = 'Thinking',
            busy_thread_id = 'retrieval-eval', updated_at = now()
        where id = ${AGENT}
      `;

      await page.goto('/chats/retrieval-eval');

      const [row] = await sql`select status from agents where id = ${AGENT}`;
      expect(row.status).toBe('busy');
    } finally {
      await sql`
        update agents set status = 'idle', status_label = 'Idle', busy_thread_id = null
        where id = ${AGENT}
      `;
      await sql.end();
    }
  });
});
