import { expect, test } from '@playwright/test';
import { dialog, ready } from '../../support/ui';

test.beforeEach(async ({ page }) => await ready(page, '/skills'));

/** Cards are buttons whose text starts with the ◈ glyph; filters are buttons too. */
const card = (page: import('@playwright/test').Page, name: string) =>
	page.locator('button', { hasText: name }).first();

test('lists skill cards with version and author', async ({ page }) => {
	const harness = card(page, 'eval-harness');
	await expect(harness).toBeVisible();
	await expect(harness).toContainText('v4');
	await expect(harness).toContainText('You');
});

test.describe('filters', () => {
	test('Mine shows only skills you authored', async ({ page }) => {
		await page.getByRole('button', { name: /^Mine/ }).click();

		const cards = page.locator('button', { hasText: '◈' });
		await expect(cards.first()).toBeVisible();
		for (const c of await cards.all()) await expect(c).toContainText('You ·');
	});

	test('Agent-authored excludes your own skills', async ({ page }) => {
		await page.getByRole('button', { name: /^Agent-authored/ }).click();

		const cards = page.locator('button', { hasText: '◈' });
		await expect(cards.first()).toBeVisible();
		for (const c of await cards.all()) await expect(c).not.toContainText('You ·');
	});

	test('search narrows the grid and reports when nothing matches', async ({ page }) => {
		const search = page.getByPlaceholder('Search skills');

		await search.fill('eval');
		await expect(card(page, 'eval-harness')).toBeVisible();

		await search.fill('zzzznotathing');
		await expect(page.getByText('No skills match.')).toBeVisible();
	});
});

test.describe('skill modal', () => {
	test('opens from a card and shows parsed markdown on the About tab', async ({ page }) => {
		await card(page, 'eval-harness').click();

		const modal = dialog(page);
		await expect(modal).toBeVisible();
		await expect(modal).toContainText('Written by You');
		/* Markdown is parsed into real elements — `{@html}` is banned in this codebase. */
		await expect(modal.locator('h1').first()).toBeVisible();
	});

	test('Used by tab lists the agents holding the skill', async ({ page }) => {
		await card(page, 'eval-harness').click();

		const modal = dialog(page);
		await modal.getByRole('button', { name: 'Used by' }).click();

		await expect(modal).toContainText('Skills are global, but attachment is per agent');
		await expect(modal.getByText('Kestrel', { exact: true })).toBeVisible();
	});

	test('closes on Escape', async ({ page }) => {
		await card(page, 'eval-harness').click();
		await expect(dialog(page)).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog(page)).toHaveCount(0);
	});

	test('closes on the close button', async ({ page }) => {
		await card(page, 'eval-harness').click();
		await dialog(page).getByRole('button', { name: 'Close' }).click();
		await expect(dialog(page)).toHaveCount(0);
	});

	test('reopens on the About tab rather than the last one used', async ({ page }) => {
		await card(page, 'eval-harness').click();
		await dialog(page).getByRole('button', { name: 'Used by' }).click();
		await page.keyboard.press('Escape');

		await card(page, 'eval-harness').click();
		await expect(dialog(page).locator('h1').first()).toBeVisible();
	});
});
