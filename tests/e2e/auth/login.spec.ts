import { expect, test } from '@playwright/test';
import { TEST_USER } from '../../support/auth';
import { readyForm } from '../../support/ui';

/** Signing in, failing to, and the redirect that carries you back. */

const signIn = async (
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  path = '/login'
) => {
  await readyForm(page, path);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

test('signs in and lands in the app', async ({ page }) => {
  await signIn(page, TEST_USER.email, TEST_USER.password);

  await expect(page).toHaveURL(/\/chats\//);
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
});

test('a wrong password and an unknown address fail identically', async ({ page }) => {
  await signIn(page, TEST_USER.email, 'not-the-password');
  const wrongPassword = await page.getByRole('alert').textContent();

  await signIn(page, 'nobody-at-all@example.com', 'not-the-password');
  const unknownEmail = await page.getByRole('alert').textContent();

  /* Any difference here would tell an attacker which addresses are registered. */
  expect(wrongPassword).toBe(unknownEmail);
  expect(wrongPassword).toMatch(/incorrect/i);
});

test('returns to the page that required signing in', async ({ page }) => {
  const thread = '/agents';
  await readyForm(page, thread);
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(thread)}`);

  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(thread);
});

test('ignores an off-site next target', async ({ page }) => {
  await signIn(page, TEST_USER.email, TEST_USER.password, '/login?next=https://example.com/evil');

  /* An open redirect would have left the app entirely. */
  await expect(page).toHaveURL(/localhost/);
  await expect(page).toHaveURL(/\/chats\//);
});
