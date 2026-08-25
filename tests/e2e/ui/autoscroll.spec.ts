import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';
import { ready } from '../../support/ui';

/**
 * The stream pins itself to the bottom so a new message is visible without the
 * user chasing it — but only while the user is already at the bottom. Scrolling
 * up to read history has to survive the next arrival, or the thread is unusable
 * while agents are talking.
 *
 * An arrival is staged in two steps: insert the row, then make the server
 * publish for this thread. The insert alone is invisible — the event bus is
 * in-memory, so a write from the test process never reaches the dev server's
 * SSE stream. Posting through the composer would publish, but it also starts
 * the agent loop, whose replies land mid-test and move the scroll position.
 */

const THREAD = 'autoscroll-thread';

/* One thread, rewritten per test, so the tests must not overlap. */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const sql = connect();
  try {
    await sql`
      insert into threads (id, name) values (${THREAD}, 'Autoscroll')
      on conflict (id) do nothing
    `;
  } finally {
    await sql.end();
  }
});

/** Enough messages that the stream is taller than the viewport and can scroll. */
const seedTall = async (count: number) => {
  const sql = connect();
  try {
    await sql`delete from entries where thread_id = ${THREAD}`;
    for (let i = 1; i <= count; i++)
      await sql`
        insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
        values (${`${THREAD}-e${i}`}, ${THREAD}, 'message', ${i}, 'kestrel',
                ${sql.json([`history line ${i}`])})
      `;
  } finally {
    await sql.end();
  }
};

/** The thread sidebar previews the last message, so lookups scope to the stream. */
const stream = (page: import('@playwright/test').Page) => page.locator('article').locator('..');

/**
 * The scrolling element itself. Found by test id rather than by walking up from
 * an entry: not every entry kind renders an `article`, so a structural lookup
 * breaks on a thread that happens to start with an error.
 */
const viewport = (page: import('@playwright/test').Page) => page.getByTestId('stream');

const metrics = async (page: import('@playwright/test').Page) =>
  await viewport(page).evaluate(el => ({
    top: el.scrollTop,
    height: el.scrollHeight,
    client: el.clientHeight
  }));

/** Distance from the bottom, which is what the pinning rule actually keys on. */
const gap = async (page: import('@playwright/test').Page) => {
  const m = await metrics(page);
  return m.height - m.top - m.client;
};

/** The scroll settles a frame after the entry renders, so this polls. */
const expectPinned = async (page: import('@playwright/test').Page) =>
  await expect.poll(async () => await gap(page)).toBeLessThan(80);

/**
 * Appends a message and makes the server announce it, so the page under test
 * updates the way it would for any other participant's message.
 *
 * The publish is a same-name rename: `renameThread` publishes this thread's
 * scope unconditionally, which is exactly the invalidation a new entry needs,
 * with no model call attached.
 */
const arrive = async (request: import('@playwright/test').APIRequestContext, text: string) => {
  const sql = connect();
  try {
    const [row] = await sql`
      select coalesce(max(seq), 0) + 1 as next from entries where thread_id = ${THREAD}
    `;
    await sql`
      insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
      values (${`${THREAD}-arrival-${row.next}`}, ${THREAD}, 'message', ${row.next}, 'kestrel',
              ${sql.json([text])})
    `;
  } finally {
    await sql.end();
  }

  const res = await request.patch(`/api/threads/${THREAD}`, { data: { name: 'Autoscroll' } });
  expect(res.ok()).toBeTruthy();
};

test('starts at the bottom, showing the newest message', async ({ page }) => {
  await seedTall(40);
  await ready(page, `/chats/${THREAD}`);

  await expectPinned(page);
  await expect(stream(page).getByText('history line 40')).toBeInViewport();
});

test('scrolls a newly arrived message into view', async ({ page, request }) => {
  await seedTall(40);
  await ready(page, `/chats/${THREAD}`);

  await arrive(request, 'arrived while at the bottom');

  const message = stream(page).getByText('arrived while at the bottom');
  await expect(message).toBeVisible();
  await expect(message).toBeInViewport();
  await expectPinned(page);
});

test('leaves the view alone when the user has scrolled up to read history', async ({
  page,
  request
}) => {
  await seedTall(40);
  await ready(page, `/chats/${THREAD}`);

  /* Scroll well clear of the bottom, as a user reading back would. */
  await viewport(page).evaluate(el => (el.scrollTop = 0));
  const before = await metrics(page);

  await arrive(request, 'arrived while reading history');

  /* The message exists in the stream, but the view did not jump to it. */
  await expect(stream(page).getByText('arrived while reading history')).toBeAttached();
  const after = await metrics(page);
  expect(after.top).toBe(before.top);
  await expect(stream(page).getByText('arrived while reading history')).not.toBeInViewport();
});

test('resumes pinning once the user scrolls back down', async ({ page, request }) => {
  await seedTall(40);
  await ready(page, `/chats/${THREAD}`);

  await viewport(page).evaluate(el => (el.scrollTop = 0));
  await arrive(request, 'missed while away');
  await expect(stream(page).getByText('missed while away')).toBeAttached();
  expect(await metrics(page).then(m => m.top)).toBe(0);

  /* Back to the bottom: the next arrival should follow again. */
  await viewport(page).evaluate(el => (el.scrollTop = el.scrollHeight));
  await arrive(request, 'seen after returning');

  await expect(stream(page).getByText('seen after returning')).toBeInViewport();
  await expectPinned(page);
});
