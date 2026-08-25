import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';
import { seedBase } from '../../support/fixtures';
import { ready } from '../../support/ui';

/**
 * The empty-threads state is the one thing the suite cannot assert in parallel:
 * it needs the thread table genuinely empty, and every other test reads the
 * seed rows. Hence its own project, which runs alone — see `playwright.config.ts`.
 *
 * The regression guarded here is `/` throwing 404 on an empty list. That error
 * escaped the `(app)` layout, so the rail never rendered and there was no way
 * to create the first thread short of editing the URL.
 */

test.describe.configure({ mode: 'serial' });

const emptyThreads = async () => {
  const sql = connect();
  try {
    await sql`truncate table steps, entries, documents, threads restart identity cascade`;
  } finally {
    await sql.end();
  }
};

/** Puts the baseline back, so the schema is as the other projects expect it. */
test.afterAll(async () => {
  const sql = connect();
  try {
    await seedBase(sql);
  } finally {
    await sql.end();
  }
});

test.beforeEach(emptyThreads);

test('with no threads, `/` renders the empty state instead of a 404', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'No threads yet' })).toBeVisible();
});

/** The 404 escaped the layout; the empty state must not. */
test('the rail stays on screen, so the app is still navigable', async ({ page }) => {
  await ready(page, '/');

  await expect(page.locator('nav').getByRole('link', { name: 'Agents' })).toBeVisible();
  await expect(page.locator('nav').getByRole('link', { name: 'Skills' })).toBeVisible();
  await expect(page.locator('nav').getByRole('link', { name: 'Docs' })).toBeVisible();
});

test('New thread creates one and opens it', async ({ page }) => {
  await ready(page, '/');

  await page.getByRole('button', { name: 'New thread' }).click();

  await page.waitForURL(/\/chats\/.+/);
  /* The sidebar only exists on a thread page, so its presence proves we landed. */
  await expect(page.getByText('Threads', { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/chats/"]')).toHaveCount(1);
});

/** Deleting the last thread must land somewhere real, not on an error page. */
test('deleting the last thread returns to the empty state', async ({ page }) => {
  const created = await page.request.post('/api/threads', { data: { name: 'Only thread' } });
  const { thread } = await created.json();

  await ready(page, `/chats/${thread.id}`);
  await page.locator(`a[href="/chats/${thread.id}"]`).click({ button: 'right' });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete thread' }).click();

  await page.waitForURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'No threads yet' })).toBeVisible();
});
