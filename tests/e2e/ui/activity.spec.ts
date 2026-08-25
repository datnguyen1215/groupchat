import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';
import { ready } from '../../support/ui';

/**
 * The drawer groups steps into runs, and a run is labelled with the agent that
 * made it. One agent can run more than once in a thread, so two groups can
 * carry the same label — the group's `id` is what keeps them distinct.
 *
 * Keying the list on the label instead crashed the render with
 * `each_key_duplicate` as soon as an agent took a second turn. These tests seed
 * exactly that trace: Wren, Kestrel, Wren.
 */

const THREAD = 'activity-ui-thread';

test.describe.configure({ mode: 'serial' });

const seed = async (labels: string[]) => {
  const sql = connect();
  try {
    await sql`
      insert into threads (id, name) values (${THREAD}, 'Activity UI')
      on conflict (id) do nothing
    `;
    await sql`delete from steps where thread_id = ${THREAD}`;
    for (const [i, label] of labels.entries())
      await sql`
        insert into steps (id, thread_id, group_label, seq, state, name, detail, duration_ms)
        values (
          ${`${THREAD}-s${i + 1}`}, ${THREAD}, ${label}, ${i + 1},
          'ok', 'search', ${`query ${i + 1}`}, 120
        )
      `;
  } finally {
    await sql.end();
  }
};

const openDrawer = async (page: import('@playwright/test').Page) => {
  await ready(page, `/chats/${THREAD}`);
  await page.getByRole('button', { name: /^Activity ·/ }).click();
  return page.getByRole('region', { name: 'Activity' });
};

test('renders a group per run when an agent runs twice', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));

  await seed(['Wren', 'Kestrel', 'Wren']);
  const drawer = await openDrawer(page);

  await expect(drawer.getByRole('heading', { name: 'Wren' })).toHaveCount(2);
  await expect(drawer.getByRole('heading', { name: 'Kestrel' })).toHaveCount(1);
  expect(errors.filter(e => e.includes('each_key_duplicate'))).toEqual([]);
});

test('counts every step across the repeated runs', async ({ page }) => {
  await seed(['Wren', 'Kestrel', 'Wren']);
  await ready(page, `/chats/${THREAD}`);

  await expect(page.getByRole('button', { name: /^Activity ·/ })).toHaveText('Activity · 3');
});

test('collapses consecutive steps by one agent into a single group', async ({ page }) => {
  await seed(['Wren', 'Wren', 'Kestrel']);
  const drawer = await openDrawer(page);

  await expect(drawer.getByRole('heading', { name: 'Wren' })).toHaveCount(1);
  await expect(drawer.getByRole('heading', { name: 'Kestrel' })).toHaveCount(1);
});

test('says so when the thread has no activity', async ({ page }) => {
  await seed([]);
  const drawer = await openDrawer(page);

  await expect(drawer.getByText('No activity in this thread.')).toBeVisible();
});
