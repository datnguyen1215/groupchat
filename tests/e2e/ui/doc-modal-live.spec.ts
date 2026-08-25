import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { dialog, ready } from '../../support/ui';
import { SEED_THREADS } from '../../../src/lib/server/db/seed-ids';

/**
 * The reported bug: a document you had open closed itself when an agent wrote
 * one. The modal rendered off a `find` into `page.data.documents`, which every
 * live event refetches — so any reload that did not contain the open id
 * unmounted it. These drive the same live events through the real SSE stream.
 */

const unique = (label: string) => `${label}-${test.info().parallelIndex}-${Date.now()}.md`;

const create = async (request: APIRequestContext, name = unique('written')) => {
  const res = await request.post('/api/documents', {
    data: {
      name,
      threadId: SEED_THREADS.retrievalEval,
      authorId: 'kestrel',
      body: '# Written\n\nBy an agent, mid-read.'
    }
  });
  return (await res.json()).document;
};

/** Opens the seeded doc from the chat's sidebar and waits for the modal. */
/** The docs lane specifically; the thread list is an `aside` too. */
const docsLane = (page: Page) => page.locator('aside.w-\\[280px\\]');

const openSeededDoc = async (page: Page) => {
  await ready(page, `/chats/${SEED_THREADS.retrievalEval}`);
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await docsLane(page).getByText('eval-protocol-v1.md').click();
  await expect(dialog(page)).toBeVisible();
};

test.describe('a document stays open while agents write', () => {
  test('survives another document being created in the same thread', async ({ page, request }) => {
    await openSeededDoc(page);

    const doc = await create(request);
    /* The new document must reach the sidebar, proving the reload really ran. */
    await expect(docsLane(page).getByText(doc.name)).toBeVisible();

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('Protocol');
  });

  test('survives a burst of writes, the way a real agent turn arrives', async ({
    page,
    request
  }) => {
    await openSeededDoc(page);

    for (let n = 0; n < 3; n++) await create(request, unique(`burst-${n}`));

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('Protocol');
  });

  test('survives the open document being renamed under it', async ({ page, request }) => {
    const doc = await create(request);

    await ready(page, '/documents');
    await page.getByText(doc.name).first().click();
    await expect(dialog(page)).toBeVisible();

    /* A rename is the case a name-derived id could not survive. */
    const renamed = unique('renamed');
    await request.patch(`/api/documents/${doc.id}`, { data: { name: renamed } });

    await expect(dialog(page)).toBeVisible();
    /* Same row, new name: the id held steady across the rename. */
    await expect(dialog(page)).toContainText(renamed);
  });

  test('reports a deletion instead of vanishing', async ({ page, request }) => {
    const doc = await create(request);

    await ready(page, '/documents');
    await page.getByText(doc.name).first().click();
    await expect(dialog(page)).toBeVisible();

    await request.delete(`/api/documents/${doc.id}`);

    /* Still open, and honest about what happened. */
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('This document was deleted');
  });

  test('the docs lane stays open, and shows the new document', async ({ page, request }) => {
    await ready(page, `/chats/${SEED_THREADS.retrievalEval}`);
    await page.getByRole('button', { name: 'Documents', exact: true }).click();

    const lane = docsLane(page);
    await expect(lane).toBeVisible();

    const doc = await create(request);

    /* The panel-collapse effect keys on the thread id, so a write must not shut it. */
    await expect(lane).toBeVisible();
    await expect(lane.getByText(doc.name)).toBeVisible();
  });

  test('closing is still the reader’s decision', async ({ page, request }) => {
    await openSeededDoc(page);
    await create(request);

    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });
});
