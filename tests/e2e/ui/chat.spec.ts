import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';
import { ready } from '../../support/ui';

/**
 * The chat surface reads the database and renders a snapshot. There is no
 * streaming and no polling, so every assertion here is about what one page load
 * shows: the stored messages, and a presence row for whoever is mid-turn.
 *
 * Nothing here calls the model. The agent loop is kicked off detached by the
 * form action, so the tests seed the rows the loop would have written.
 */

/**
 * Its own thread, not a shared one: these tests rewrite the entry list, and the
 * documents suite reads `retrieval-eval` at the same time.
 */
const THREAD = 'chat-ui-thread';

/* Every test here rewrites the same thread, so they must not overlap. */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const sql = connect();
  try {
    await sql`
      insert into threads (id, name) values (${THREAD}, 'Chat UI')
      on conflict (id) do nothing
    `;
  } finally {
    await sql.end();
  }
});

const seedEntries = async (rows: { author: string; text: string }[]) => {
  const sql = connect();
  try {
    await sql`delete from entries where thread_id = ${THREAD}`;
    for (const [i, r] of rows.entries())
      await sql`
        insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
        values (${`${THREAD}-e${i + 1}`}, ${THREAD}, 'message', ${i + 1}, ${r.author},
                ${sql.json([r.text])})
      `;
  } finally {
    await sql.end();
  }
};

/** The thread sidebar previews the last message, so assertions scope to the stream. */
const stream = (page: import('@playwright/test').Page) => page.locator('article').locator('..');

/** Busy is always busy *in a thread*; that is what scopes the presence row. */
const setStatus = async (agentId: string, status: string, label: string, title?: string) => {
  const sql = connect();
  try {
    await sql`
      update agents
      set status = ${status},
          status_label = ${label},
          status_title = ${title ?? null},
          busy_thread_id = ${status === 'busy' ? THREAD : null}
      where id = ${agentId}
    `;
  } finally {
    await sql.end();
  }
};

/**
 * The steps the presence row lists under the title. `group_label` is the agent
 * name, which is how a step finds the row it belongs to.
 */
const seedSteps = async (groupLabel: string, names: string[]) => {
  const sql = connect();
  try {
    await sql`delete from steps where thread_id = ${THREAD}`;
    for (const [i, name] of names.entries())
      await sql`
        insert into steps (id, thread_id, group_label, seq, state, name, detail, duration_ms)
        values (${`${THREAD}-s${i + 1}`}, ${THREAD}, ${groupLabel}, ${i + 1}, 'ok',
                ${name}, '', ${(i + 1) * 1000})
      `;
  } finally {
    await sql.end();
  }
};

test.describe('the message stream', () => {
  test('renders stored messages in seq order, attributed to their authors', async ({ page }) => {
    await seedEntries([
      { author: 'you', text: 'Design a retrieval eval.' },
      { author: 'orchestrator', text: 'Kestrel, take metrics.' },
      { author: 'kestrel', text: 'Starting with recall at k.' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    await expect(stream(page).getByText('Design a retrieval eval.')).toBeVisible();
    await expect(stream(page).getByText('Kestrel, take metrics.')).toBeVisible();
    await expect(stream(page).getByText('Starting with recall at k.')).toBeVisible();
  });

  /* The bug this design exists to prevent, checked at the surface the user sees. */
  test('a later message does not replace an earlier one', async ({ page }) => {
    await seedEntries([
      { author: 'wren', text: 'first thing said' },
      { author: 'kestrel', text: 'second thing said' }
    ]);

    await ready(page, `/chats/${THREAD}`);

    await expect(stream(page).getByText('first thing said')).toBeVisible();
    await expect(stream(page).getByText('second thing said')).toBeVisible();
  });

  test('says so when the thread is empty', async ({ page }) => {
    await seedEntries([]);

    await ready(page, `/chats/${THREAD}`);
    await expect(page.getByText('Nothing here yet. Say something to get started.')).toBeVisible();
  });
});

test.describe('presence', () => {
  /**
   * Its own agent, for the same reason as the thread: `agents.status` is global,
   * and flipping a shared agent to busy would show a working row in every other
   * suite's thread.
   */
  const AGENT = 'presence-probe';

  test.beforeAll(async () => {
    const sql = connect();
    try {
      await sql`
        insert into agents (id, name, initials, color, kind, role)
        values (${AGENT}, 'Probe', 'P', '#7aa2ff', 'research', 'prober')
        on conflict (id) do nothing
      `;
    } finally {
      await sql.end();
    }
  });

  test.afterEach(async () => {
    await setStatus(AGENT, 'idle', 'Idle');
    await seedSteps('Probe', []);
  });

  test('shows a working row for a busy agent', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await setStatus(AGENT, 'busy', 'Working');

    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByText('Probe', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Working')).toBeVisible();
  });

  test('shows no working row when every agent is idle', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await setStatus(AGENT, 'idle', 'Idle');

    await ready(page, `/chats/${THREAD}`);
    await expect(page.getByLabel('Working')).toHaveCount(0);
  });

  /**
   * An agent parked in `run_agent` keeps a `busy` row so the turn can still be
   * cleaned up, but it has nothing to report while it waits. Showing it puts a
   * second working row next to the workers it is waiting on, which reads as one
   * more agent doing work.
   */
  test('hides the row for an agent that is only waiting on its delegates', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await setStatus(AGENT, 'busy', 'Delegating');

    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByText('Probe', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Working')).toHaveCount(0);
  });

  test('shows the row again once it goes back to composing', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await setStatus(AGENT, 'busy', 'Thinking');

    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByText('Probe', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Working')).toBeVisible();
  });

  /**
   * The point of the whole feature: the row says what the agent is doing, in
   * the agent's own words, not which tool it happened to call.
   */
  test('shows the agent’s own words for what it is working on', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await seedSteps('Probe', []);
    await setStatus(AGENT, 'busy', 'Working', 'Comparing payment terms');

    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByText('Comparing payment terms')).toBeVisible();
  });

  test('lists the steps it already finished under the title', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await seedSteps('Probe', ['read_document', 'web_search']);
    await setStatus(AGENT, 'busy', 'Working', 'Comparing payment terms');

    await ready(page, `/chats/${THREAD}`);

    const done = page.getByLabel('Finished steps');
    await expect(done.getByText('read_document')).toBeVisible();
    await expect(done.getByText('web_search')).toBeVisible();
  });

  /**
   * The row sits above the composer. Uncapped, a long turn pushes it off screen,
   * so the query keeps only the most recent few.
   */
  test('keeps only the last three steps', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await seedSteps('Probe', ['first_call', 'second_call', 'third_call', 'fourth_call']);
    await setStatus(AGENT, 'busy', 'Working', 'Still going');

    await ready(page, `/chats/${THREAD}`);

    const done = page.getByLabel('Finished steps');
    await expect(done.getByText('fourth_call')).toBeVisible();
    await expect(done.getByText('first_call')).toHaveCount(0);
  });

  /**
   * The stretch before an agent's first `set_status` call has no title. The row
   * falls back to the last thing it did rather than going blank.
   */
  test('falls back to the last step before the first status arrives', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await seedSteps('Probe', ['web_search']);
    await setStatus(AGENT, 'busy', 'Working');

    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByLabel('Presence: Probe').getByText('web_search')).toBeVisible();
  });

  /**
   * Steps are scoped to the agent that ran them. A thread-wide "last step"
   * captions every busy row with whichever agent happened to write last.
   */
  test('does not caption a row with another agent’s steps', async ({ page }) => {
    await seedEntries([{ author: 'you', text: 'go' }]);
    await seedSteps('Someone Else', ['not_my_call']);
    await setStatus(AGENT, 'busy', 'Working', 'Comparing payment terms');

    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByText('Comparing payment terms')).toBeVisible();
    await expect(page.getByLabel('Finished steps')).toHaveCount(0);
  });
});

test.describe('composer', () => {
  test('posts the message into the thread', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    await box.fill('a message that should persist');
    await box.press('Enter');

    /* The action redirects; the message is read back from the database. */
    await expect(stream(page).getByText('a message that should persist')).toBeVisible();
    await expect(box).toHaveValue('');
  });

  test('survives a reload, because it was stored and not just rendered', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    await box.fill('durable message');
    await box.press('Enter');
    await expect(stream(page).getByText('durable message')).toBeVisible();

    await page.reload();
    await expect(stream(page).getByText('durable message')).toBeVisible();
  });

  test('will not send an empty message', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

/**
 * The box used to be a fixed `rows="1"`, so a wrapped message scrolled out of
 * sight as you typed it. Height is a rendered value, not state, so these read it
 * back off the element rather than asserting on the markup.
 */
test.describe('the composer grows with its text', () => {
  /** Eight lines at 13.5px/1.5 — the cap the component stops growing at. */
  const MAX = 168;
  const ONE_LINE = 21;

  const height = async (box: import('@playwright/test').Locator) =>
    box.evaluate((el: HTMLTextAreaElement) => el.clientHeight);

  /** Long enough to wrap, without depending on where any single word breaks. */
  const wrapping = (times: number) =>
    'The quick brown fox jumps over the lazy dog and keeps running. '.repeat(times).trim();

  test('starts at one line', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    expect(await height(box)).toBe(ONE_LINE);
  });

  test('gets taller as the message wraps', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    await box.fill(wrapping(1));
    const short = await height(box);

    await box.fill(wrapping(4));
    const tall = await height(box);

    expect(tall).toBeGreaterThan(short);
    expect(tall).toBeLessThanOrEqual(MAX);
  });

  test('stops at the cap and scrolls instead', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    await box.fill(wrapping(40));

    expect(await height(box)).toBe(MAX);

    /* Past the cap the text must still be reachable, not clipped away. */
    const scrollable = await box.evaluate(
      (el: HTMLTextAreaElement) => el.scrollHeight > el.clientHeight
    );
    expect(scrollable).toBe(true);
  });

  test('shrinks back to one line after sending', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    await box.fill(wrapping(4));
    expect(await height(box)).toBeGreaterThan(ONE_LINE);

    await box.press('Enter');
    await expect(box).toHaveValue('');

    await expect.poll(() => height(box)).toBe(ONE_LINE);
  });

  test('shrinks back when the text is deleted', async ({ page }) => {
    await seedEntries([]);
    await ready(page, `/chats/${THREAD}`);

    const box = page.getByPlaceholder('Message the group…');
    await box.fill(wrapping(4));
    expect(await height(box)).toBeGreaterThan(ONE_LINE);

    await box.fill('');
    expect(await height(box)).toBe(ONE_LINE);
  });
});
