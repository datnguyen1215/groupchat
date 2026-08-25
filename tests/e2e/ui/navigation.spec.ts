import { expect, test } from '@playwright/test';
import { ready } from '../../support/ui';

/**
 * The rail's divider encodes scope: Chats is thread-scoped and keeps the threads
 * sidebar; Agents / Skills / Docs are global and must not render it. That is the
 * shell's central design decision, so it is what these guard.
 *
 * The rail's own Chats link points at `/`, not at a thread, so a `/chats/` link
 * on the page comes from the sidebar and nowhere else.
 */
const chatLinks = (page: import('@playwright/test').Page) => page.locator('a[href^="/chats/"]');

test('root redirects into the first thread', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/chats\/.+/);
});

test('chats renders the threads sidebar', async ({ page }) => {
  await ready(page, '/');
  expect(await chatLinks(page).count()).toBeGreaterThan(0);
});

for (const [, path, heading] of [
  ['Agents', '/agents', 'Agents'],
  ['Skills', '/skills', 'Skills'],
  ['Docs', '/documents', 'Documents']
] as const) {
  test(`${path} is a global page without the threads sidebar`, async ({ page }) => {
    await ready(page, '/');
    await page.locator(`nav a[href="${path}"]`).click();

    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(chatLinks(page)).toHaveCount(0);
  });
}

test('the rail marks the current page as active', async ({ page }) => {
  await ready(page, '/skills');
  await expect(page.locator('nav a[href="/skills"]')).toContainClass('bg-panel-2');
  await expect(page.locator('nav a[href="/agents"]')).not.toContainClass('bg-panel-2');
});

test('every page renders without a console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(e.message));

  for (const path of ['/', '/agents', '/skills', '/documents']) await ready(page, path);
  expect(errors).toEqual([]);
});
