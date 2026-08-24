import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dialog, ready } from '../../support/ui';

const unique = (label: string) => `${label}-${test.info().parallelIndex}-${Date.now()}`;

/** Creates a throwaway thread over the API so the seed rows stay intact. */
const scratch = async (page: Page) => {
  const name = unique('scratch');
  const res = await page.request.post('/api/threads', { data: { name } });
  return { ...(await res.json()).thread, name } as { id: string; name: string };
};

const row = (page: Page, name: string) => page.locator(`a[href^="/chats/"]:has-text("${name}")`);

const openMenu = async (page: Page, name: string) => {
  await row(page, name).click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
};

test('the context menu offers Rename and Delete', async ({ page }) => {
  const thread = await scratch(page);
  await ready(page, '/');
  await openMenu(page, thread.name);

  await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();

  await page.request.delete(`/api/threads/${thread.id}`);
});

test('Delete asks first and names the thread', async ({ page }) => {
  const thread = await scratch(page);
  await ready(page, '/');
  await openMenu(page, thread.name);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText(thread.name);
  /* Still there — the dialog alone must not delete. */
  expect((await page.request.get(`/api/threads/${thread.id}`)).status()).toBe(200);

  await page.request.delete(`/api/threads/${thread.id}`);
});

test('confirming removes the thread from the sidebar', async ({ page }) => {
  const thread = await scratch(page);
  await ready(page, '/');
  await openMenu(page, thread.name);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Delete thread' }).click();

  await expect(row(page, thread.name)).toHaveCount(0);
  expect((await page.request.get(`/api/threads/${thread.id}`)).status()).toBe(404);
});

test('deleting the open thread navigates away from its dead route', async ({ page }) => {
  const thread = await scratch(page);
  await ready(page, `/chats/${thread.id}`);
  await openMenu(page, thread.name);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Delete thread' }).click();

  await expect(page).not.toHaveURL(new RegExp(thread.id));
  await expect(page).toHaveURL(/\/chats\/.+/);
});

for (const [label, dismiss] of [
  ['Cancel', async (page: Page) => dialog(page).getByRole('button', { name: 'Cancel' }).click()],
  ['Escape', async (page: Page) => page.keyboard.press('Escape')]
] as const) {
  test(`${label} closes the dialog and keeps the thread`, async ({ page }) => {
    const thread = await scratch(page);
    await ready(page, '/');
    await openMenu(page, thread.name);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog(page)).toBeVisible();

    await dismiss(page);

    await expect(dialog(page)).toHaveCount(0);
    await expect(row(page, thread.name)).toHaveCount(1);
    expect((await page.request.get(`/api/threads/${thread.id}`)).status()).toBe(200);

    await page.request.delete(`/api/threads/${thread.id}`);
  });
}
