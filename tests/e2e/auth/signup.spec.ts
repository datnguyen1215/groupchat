import { expect, test } from '@playwright/test';
import { readyForm } from '../../support/ui';

/**
 * Signup rejects what it should before creating anything, and the one error it
 * cannot predict — a taken address — comes back from the server.
 */

const unique = () => `new-${test.info().parallelIndex}-${Date.now()}@example.com`;

const fill = async (
  page: import('@playwright/test').Page,
  fields: { email: string; password: string; confirm: string }
) => {
  await readyForm(page, '/signup');
  await page.getByLabel('Email').fill(fields.email);
  await page.getByLabel('Password', { exact: true }).fill(fields.password);
  await page.getByLabel('Confirm password').fill(fields.confirm);
  await page.getByRole('button', { name: 'Create account' }).click();
};

test('creates an account and lands in the app', async ({ page }) => {
  await fill(page, { email: unique(), password: 'long-enough-1', confirm: 'long-enough-1' });

  await expect(page).toHaveURL(/\/chats\//);
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
});

test('rejects a password that does not match the confirmation', async ({ page }) => {
  const email = unique();
  await fill(page, { email, password: 'long-enough-1', confirm: 'something-else-2' });

  await expect(page.getByRole('alert')).toHaveText(/Passwords don't match/);
  await expect(page).toHaveURL(/\/signup/);
});

test('rejects a password under the minimum length', async ({ page }) => {
  await fill(page, { email: unique(), password: 'short', confirm: 'short' });

  await expect(page.getByRole('alert')).toHaveText(/at least 8 characters/i);
  await expect(page).toHaveURL(/\/signup/);
});

test('keeps the email on a failed attempt so it need not be retyped', async ({ page }) => {
  const email = unique();
  await fill(page, { email, password: 'long-enough-1', confirm: 'mismatch-here-2' });

  await expect(page.getByLabel('Email')).toHaveValue(email);
});

test('refuses an address that already has an account', async ({ page, request }) => {
  const email = unique();

  /* Claimed over HTTP so the test drives the browser through the case it is about. */
  const claimed = await request.post('/api/auth/sign-up/email', {
    data: { email, password: 'long-enough-1', name: 'taken' }
  });
  expect(claimed.ok()).toBeTruthy();

  await fill(page, { email, password: 'long-enough-1', confirm: 'long-enough-1' });

  await expect(page.getByRole('alert')).toHaveText(/already exists/i);
  await expect(page).toHaveURL(/\/signup/);
});
