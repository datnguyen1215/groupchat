import { expect, test } from '@playwright/test';
import { ready } from '../../support/ui';

/**
 * The chat surface has no backend — these cover the shell behaviour the frontend
 * already owns, not message delivery. Sending clears the box and nothing else.
 */

test.beforeEach(async ({ page }) => await ready(page, '/'));

const composer = (page: import('@playwright/test').Page) =>
	page.getByPlaceholder('Message the group…');

test('shows the conversation with the orchestrator badged', async ({ page }) => {
	await expect(page.getByText('Orchestrator').first()).toBeVisible();
});

test('switching threads changes the conversation and the URL', async ({ page }) => {
	const first = page.url();

	/* Sidebar links only — the rail's own Chats link points at the first thread. */
	await page.locator('aside a[href^="/chats/"]').nth(1).click();

	await expect(page).not.toHaveURL(first);
	await expect(page).toHaveURL(/\/chats\/.+/);
});

test.describe('activity drawer', () => {
	test('summarises activity as a sparkline pill in the stream', async ({ page }) => {
		await expect(page.getByText(/ran \d+ tools/).first()).toBeVisible();
	});

	test('opens from the pill and indents sub-agents under their spawn step', async ({ page }) => {
		await page.getByText(/ran \d+ tools/).first().click();
		await expect(page.getByText('reader-1')).toBeVisible();
	});
});

test.describe('composer', () => {
	test('clears the textarea on send', async ({ page }) => {
		const box = composer(page);

		await box.fill('a test message');
		await expect(box).toHaveValue('a test message');

		await box.press('Enter');
		await expect(box).toHaveValue('');
	});

	test('does not post the message, since there is no backend yet', async ({ page }) => {
		const box = composer(page);

		await box.fill('unsent message');
		await box.press('Enter');

		await expect(page.getByText('unsent message')).toHaveCount(0);
	});
});
