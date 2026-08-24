import { expect, type Page } from '@playwright/test';

/**
 * Every interactive assertion needs hydration to have finished — the markup is
 * server-rendered, so a click can otherwise land on inert HTML and be lost.
 * Waiting on the rail's active-state class is the cheapest hydration signal.
 */
export const ready = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('nav a').first()).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll('button').length > 0);
  /* Svelte attaches listeners on the microtask after paint. */
  await page.waitForTimeout(250);
};

/** The scrim also carries `aria-label="Close"`, so modal lookups scope to the dialog. */
export const dialog = (page: Page) => page.getByRole('dialog');

/**
 * The signed-out pages have no rail, so `ready` cannot wait on it. The submit
 * button is the equivalent signal: the form is inert until Svelte attaches to it.
 */
export const readyForm = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('form button[type="submit"]')).toBeVisible();
  await page.waitForTimeout(250);
};
