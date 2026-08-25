import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';
import { ready } from '../../support/ui';

/**
 * A failed turn is not an agent choosing to speak. It is stored as its own
 * entry kind with no author, and rendered as a break in the conversation —
 * no avatar, no name, no tag. These tests hold that line at the surface, since
 * the failure mode being prevented is a crash wearing the orchestrator's face.
 *
 * Nothing here calls the model: the loop writes these rows detached, so the
 * tests seed the row the loop would have written.
 */

/** Its own thread — these tests rewrite the entry list. */
const THREAD = 'error-ui-thread';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const sql = connect();
  try {
    await sql`
      insert into threads (id, name) values (${THREAD}, 'Error UI')
      on conflict (id) do nothing
    `;
  } finally {
    await sql.end();
  }
});

type Row = { kind: 'message'; author: string; text: string } | { kind: 'error'; line: string };

const seed = async (rows: Row[]) => {
  const sql = connect();
  try {
    await sql`delete from entries where thread_id = ${THREAD}`;
    for (const [i, r] of rows.entries()) {
      const id = `${THREAD}-e${i + 1}`;
      const seq = i + 1;
      if (r.kind === 'error')
        await sql`
          insert into entries (id, thread_id, kind, seq, label)
          values (${id}, ${THREAD}, 'error', ${seq}, ${r.line})
        `;
      else
        await sql`
          insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
          values (${id}, ${THREAD}, 'message', ${seq}, ${r.author}, ${sql.json([r.text])})
        `;
    }
  } finally {
    await sql.end();
  }
};

const errorRow = (page: import('@playwright/test').Page) =>
  page.getByRole('status', { name: 'Error' });

/** The sidebar previews the last message, so message assertions scope to the stream. */
const stream = (page: import('@playwright/test').Page) => page.locator('article').locator('..');

test.describe('the error entry', () => {
  test('shows the failure line', async ({ page }) => {
    await seed([
      { kind: 'message', author: 'you', text: 'go' },
      { kind: 'error', line: 'The model provider is rate limiting us' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    await expect(errorRow(page)).toContainText('The model provider is rate limiting us');
  });

  /**
   * The whole point of the entry kind. An error carries no `authorId`, so it
   * must not render the avatar, name or tag that a message does.
   */
  test('carries no author, so it cannot read as an agent speaking', async ({ page }) => {
    await seed([
      { kind: 'message', author: 'orchestrator', text: 'Kestrel, take metrics.' },
      { kind: 'error', line: 'The model provider timed out' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    const row = errorRow(page);
    await expect(row).toBeVisible();
    /* The orchestrator's own message still has all three; the error has none. */
    await expect(row.getByText('Orchestrator')).toHaveCount(0);
    await expect(row.getByText('orch')).toHaveCount(0);
    await expect(row.locator('article')).toHaveCount(0);
  });

  test('is not an article, so it sits outside the message stream', async ({ page }) => {
    await seed([
      { kind: 'message', author: 'you', text: 'go' },
      { kind: 'error', line: 'Something went wrong on our side' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    /* One message seeded, so exactly one article — the error added none. */
    await expect(page.locator('article')).toHaveCount(1);
    await expect(errorRow(page)).toHaveCount(1);
  });

  test('keeps its place in seq order between messages', async ({ page }) => {
    await seed([
      { kind: 'message', author: 'you', text: 'first thing said' },
      { kind: 'error', line: 'The model provider is having trouble' },
      { kind: 'message', author: 'you', text: 'second thing said' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    await expect(stream(page).getByText('first thing said')).toBeVisible();
    await expect(errorRow(page)).toBeVisible();
    await expect(stream(page).getByText('second thing said')).toBeVisible();
  });

  /** A worker failure names the agent; the orchestrator's does not. */
  test('shows a worker failure under the worker name', async ({ page }) => {
    await seed([{ kind: 'error', line: 'Wren stopped — the model provider timed out' }]);

    await ready(page, `/chats/${THREAD}`);

    await expect(errorRow(page)).toContainText('Wren stopped — the model provider timed out');
  });

  test('renders several failures as separate rows', async ({ page }) => {
    await seed([
      { kind: 'error', line: 'The model provider is rate limiting us' },
      { kind: 'error', line: 'Wren stopped — the model provider timed out' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    await expect(errorRow(page)).toHaveCount(2);
  });

  /* Persisted, not transient: a reload must show the same thing. */
  test('survives a reload', async ({ page }) => {
    await seed([{ kind: 'error', line: 'The model provider rejected our credentials' }]);

    await ready(page, `/chats/${THREAD}`);
    await expect(errorRow(page)).toBeVisible();

    await page.reload();
    await expect(errorRow(page)).toContainText('The model provider rejected our credentials');
  });
});
