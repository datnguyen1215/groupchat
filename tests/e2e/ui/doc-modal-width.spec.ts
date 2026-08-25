import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dialog, ready } from '../../support/ui';
import { SEED_THREADS } from '../../../src/lib/server/db/seed-ids';

/**
 * The document dialog used to cap twice: the shell at 780px and the prose at
 * 62ch (~560px) inside it. On a 1440px viewport that left the document reading
 * in roughly a third of the window, with the rest of the dialog dead gutter.
 * These pin both caps, because removing only one of them changes nothing.
 */

const docsLane = (page: Page) => page.locator('aside.w-\\[280px\\]');

const openSeededDoc = async (page: Page) => {
  await ready(page, `/chats/${SEED_THREADS.retrievalEval}`);
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await docsLane(page).getByText('eval-protocol-v1.md').click();
  await expect(dialog(page)).toBeVisible();
};

/** The markdown wrapper is the dialog's only direct prose container. */
const prose = (page: Page) => dialog(page).locator('div.text-\\[14px\\]\\/\\[1\\.7\\]').first();

const widthOf = async (page: Page, locator: ReturnType<typeof dialog>) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.width;
};

test.describe('the document dialog reads wide', () => {
  test('the dialog itself reaches 1060px, not 780px', async ({ page }) => {
    await openSeededDoc(page);

    /* 1440px viewport minus the 20px scrim padding leaves room for the full cap. */
    expect(await widthOf(page, dialog(page))).toBeCloseTo(1060, -1);
  });

  test('the prose fills the dialog instead of stopping at 62ch', async ({ page }) => {
    await openSeededDoc(page);

    const dialogWidth = await widthOf(page, dialog(page));
    const proseWidth = await widthOf(page, prose(page));

    /* The old 62ch cap sat near 560px — well under half the widened dialog. */
    expect(proseWidth).toBeGreaterThan(900);

    /* Whatever the padding is, prose must not be capped independently of it. */
    expect(dialogWidth - proseWidth).toBeLessThan(100);
  });

  test('a paragraph runs the full measure, not a 62ch column', async ({ page }) => {
    await openSeededDoc(page);

    const paragraph = prose(page).locator('p').first();
    await expect(paragraph).toBeVisible();

    expect(await widthOf(page, paragraph)).toBeGreaterThan(900);
  });

  test('the skill dialog is left narrow', async ({ page }) => {
    await ready(page, '/skills');
    await page.locator('button', { hasText: 'eval-harness' }).first().click();
    await expect(dialog(page)).toBeVisible();

    /* Only documents were widened; the shared Modal keeps its 780px default. */
    expect(await widthOf(page, dialog(page))).toBeCloseTo(780, -1);
  });
});
