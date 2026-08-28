import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';

/**
 * `seq` orders a thread and doubles as the SSE cursor, so a duplicate is not
 * cosmetic — it reorders the feed and collides the keys the drawer renders on.
 *
 * The old writers read `max(seq)` and inserted afterwards. Two agents appending
 * to the same thread both read the same max and both wrote it. These tests run
 * the writes concurrently, which is the only way that race shows up.
 */

const threadId = 'seq-race-thread';

const reset = async (sql: ReturnType<typeof connect>) => {
  await sql`insert into threads (id, name) values (${threadId}, 'Seq race') on conflict do nothing`;
  await sql`delete from entries where thread_id = ${threadId}`;
  await sql`delete from steps where thread_id = ${threadId}`;
};

/** Mirrors the writers: `seq` resolved inside the insert, never read first. */
const insertEntry = (sql: ReturnType<typeof connect>, id: string) => sql`
  insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
  select ${id}, ${threadId}, 'message',
         coalesce(max(seq), 0) + 1, 'you', ${sql.json([id])}
  from entries where thread_id = ${threadId}
`;

const insertStep = (sql: ReturnType<typeof connect>, id: string) => sql`
  insert into steps (id, thread_id, group_label, seq, state, name)
  select ${id}, ${threadId}, 'Wren',
         coalesce(max(seq), 0) + 1, 'ok', ${id}
  from steps where thread_id = ${threadId}
`;

/**
 * A losing writer hits the unique index rather than writing a duplicate. That
 * is the point of the constraint, so a rejection here is a pass — what the test
 * forbids is two rows landing on one number.
 */
const settle = (work: Promise<unknown>[]) => Promise.allSettled(work);

test.describe('concurrent appends never duplicate seq', () => {
  test('twenty messages racing into one thread', async () => {
    const sql = connect();
    try {
      await reset(sql);

      await settle(Array.from({ length: 20 }, (_, i) => insertEntry(sql, `m${i}`)));

      const dupes = await sql`
        select seq from entries where thread_id = ${threadId}
        group by seq having count(*) > 1
      `;
      expect(dupes).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  test('twenty steps racing into one thread', async () => {
    const sql = connect();
    try {
      await reset(sql);

      await settle(Array.from({ length: 20 }, (_, i) => insertStep(sql, `s${i}`)));

      const dupes = await sql`
        select seq from steps where thread_id = ${threadId}
        group by seq having count(*) > 1
      `;
      expect(dupes).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  /** The constraint itself, stated plainly: the same number twice is rejected. */
  test('the database refuses a second row on a taken seq', async () => {
    const sql = connect();
    try {
      await reset(sql);

      await sql`
        insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
        values ('taken', ${threadId}, 'message', 1, 'you', ${sql.json(['first'])})
      `;

      await expect(
        sql`
          insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
          values ('duplicate', ${threadId}, 'message', 1, 'you', ${sql.json(['second'])})
        `
      ).rejects.toThrow();
    } finally {
      await sql.end();
    }
  });
});
