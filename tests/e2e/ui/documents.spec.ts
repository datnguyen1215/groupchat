import { expect, test } from '@playwright/test';
import { dialog, ready } from '../../support/ui';

test.describe('documents page', () => {
	test.beforeEach(async ({ page }) => await ready(page, '/documents'));

	test('renders documents as a table, since the useful scan is thread and author', async ({
		page
	}) => {
		await expect(page.locator('table')).toBeVisible();
		/* Header row plus one row per document. */
		expect(await page.locator('tr').count()).toBeGreaterThan(1);
	});

	test('search filters the table and reports an empty result', async ({ page }) => {
		const search = page.getByPlaceholder('Search documents');

		await search.fill('eval-protocol');
		await expect(page.getByText('eval-protocol-v1.md').first()).toBeVisible();

		await search.fill('zzzznotathing');
		await expect(page.getByText('No documents match.')).toBeVisible();
	});

	test('opens a document in a modal with parsed markdown', async ({ page }) => {
		await page.getByText('eval-protocol-v1.md').first().click();

		const modal = dialog(page);
		await expect(modal).toBeVisible();
		/* The fixture body has a heading, a table and a code fence; all must be real elements. */
		await expect(modal.locator('h1').first()).toBeVisible();
		await expect(modal.locator('table')).toBeVisible();
		await expect(modal.locator('pre')).toBeVisible();
	});

	test('closes on Escape', async ({ page }) => {
		await page.getByText('eval-protocol-v1.md').first().click();
		await expect(dialog(page)).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog(page)).toHaveCount(0);
	});
});

test.describe('thread documents', () => {
	test.beforeEach(async ({ page }) => await ready(page, '/'));

	test('the chat sidebar opens from the header and is scoped to the thread', async ({ page }) => {
		/* The docs lane is optional and closed by default, matching the calm shell. */
		const sidebar = page.locator('aside.w-\\[280px\\]');
		await expect(sidebar).toHaveCount(0);

		await page.getByRole('button', { name: 'Documents', exact: true }).click();
		await expect(sidebar).toContainText('Documents');
		await expect(sidebar.getByText('eval-protocol-v1.md')).toBeVisible();
	});

	test('a document chip in a message opens the same modal', async ({ page }) => {
		await page.locator('button', { hasText: '.md' }).first().click();
		await expect(dialog(page)).toBeVisible();
	});
});
