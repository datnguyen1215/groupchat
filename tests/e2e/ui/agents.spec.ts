import { expect, test } from '@playwright/test';
import { ready } from '../../support/ui';

test.beforeEach(async ({ page }) => await ready(page, '/agents'));

/**
 * The three tiers are a design opinion, not just layout: spawned helpers are real
 * but must not compete visually with the permanent roster.
 */
test('renders all three tiers in order', async ({ page }) => {
  const headings = page.getByRole('heading', { level: 2 });
  await expect(headings).toHaveText([/Orchestrator/i, /Research agents/i, /Spawned this session/i]);
});

test('the orchestrator is described by what it does not do', async ({ page }) => {
  await expect(page.getByText(/never answers directly/i)).toBeVisible();
});

test('research agents show status and attached skills', async ({ page }) => {
  await expect(page.getByText('Kestrel').first()).toBeVisible();
  await expect(page.getByText('eval-harness').first()).toBeVisible();
  await expect(page.getByText('Running').first()).toBeVisible();
});

test('spawned agents collapse into one card with an instance count', async ({ page }) => {
  await expect(page.getByText(/paper-reader/).first()).toBeVisible();
  await expect(page.getByText(/instances/i)).toBeVisible();
});
