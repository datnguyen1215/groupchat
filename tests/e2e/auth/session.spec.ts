import { expect, test } from '@playwright/test';
import { TEST_USER } from '../../support/auth';
import { ready, readyForm } from '../../support/ui';

/** What a session is worth: what it opens, and what ends it. */

const signIn = async (page: import('@playwright/test').Page) => {
  await readyForm(page, '/login');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/chats\//);
};

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/agents');
  await expect(page).toHaveURL(/\/login/);
});

test('the API answers 401 rather than redirecting', async ({ request }) => {
  /* This project carries no storage state, so the call is unauthenticated. */
  const res = await request.get('/api/threads');
  expect(res.status()).toBe(401);
});

test('a signed-in user is bounced off the auth pages', async ({ page }) => {
  await signIn(page);

  for (const path of ['/login', '/signup']) {
    await page.goto(path);
    await expect(page).not.toHaveURL(new RegExp(path));
  }
});

test('the account menu shows the signed-in address', async ({ page }) => {
  await signIn(page);
  /* The rail arrives with the navigation; its menu is inert until hydrated. */
  await ready(page, page.url());
  await page.getByRole('button', { name: 'Account' }).click();

  await expect(page.getByText(TEST_USER.email)).toBeVisible();
});

test('signing out ends the session and re-gates the app', async ({ page }) => {
  await signIn(page);
  await ready(page, page.url());

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);

  /* The cookie is gone, not merely unused. */
  await page.goto('/agents');
  await expect(page).toHaveURL(/\/login/);
});
