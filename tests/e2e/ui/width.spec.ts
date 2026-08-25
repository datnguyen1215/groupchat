import { expect, test } from '@playwright/test';
import { connect } from '../../support/db';
import { ready } from '../../support/ui';

/**
 * The stream used to sit in a 620px centred column. It is full bleed now, so
 * what these tests pin is the *relationship*: the message column and the
 * composer track the pane they sit in, at every viewport, rather than stopping
 * at a fixed measure.
 *
 * Asserting a pixel width would just re-hardcode the cap in a second place.
 */

const THREAD = 'chat-width-thread';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const sql = connect();
  try {
    await sql`
      insert into threads (id, name) values (${THREAD}, 'Chat width')
      on conflict (id) do nothing
    `;
    await sql`delete from entries where thread_id = ${THREAD}`;
    await sql`
      insert into entries (id, thread_id, kind, seq, author_id, paragraphs)
      values (${`${THREAD}-e1`}, ${THREAD}, 'message', 1, 'you',
              ${sql.json(['A message wide enough to measure.'])})
    `;
  } finally {
    await sql.end();
  }
});

/** The scrolling viewport; its child is the column the cap used to live on. */
const streamViewport = (page: import('@playwright/test').Page) =>
  page.getByTestId('stream');

const box = async (locator: ReturnType<typeof streamViewport>) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element is not visible, so it has no box');
  return b;
};

test.describe('the chat is full bleed', () => {
  test('the message column fills its viewport at a wide size', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await ready(page, `/chats/${THREAD}`);

    const viewport = await box(streamViewport(page));
    const column = await box(streamViewport(page).locator('> div'));

    /* The column carries px-6 either side; nothing else may take width off it. */
    expect(column.width).toBeCloseTo(viewport.width, 0);
  });

  test('the column grows when the window does', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await ready(page, `/chats/${THREAD}`);
    const narrow = await box(streamViewport(page).locator('> div'));

    await page.setViewportSize({ width: 1600, height: 900 });
    await expect
      .poll(async () => (await box(streamViewport(page).locator('> div'))).width)
      .toBeGreaterThan(narrow.width + 500);
  });

  test('the composer spans the same width as the stream', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await ready(page, `/chats/${THREAD}`);

    const column = await box(streamViewport(page).locator('> div'));
    const composer = await box(page.getByPlaceholder('Message the group…').locator('../..'));

    /* Both sit inside px-6 gutters, so their left edges line up. */
    expect(composer.width).toBeCloseTo(column.width, 0);
    expect(composer.x).toBeCloseTo(column.x, 0);
  });

  test('the message body is not capped at a fixed measure', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await ready(page, `/chats/${THREAD}`);

    const column = await box(streamViewport(page).locator('> div'));
    const body = await box(page.locator('article').first().locator('> div'));

    /**
     * `column` is the border box, so its px-6 gutters sit outside it; the body
     * loses those 48px and nothing more. `pl-[30px]` is padding, so it is
     * already inside the body's own box and must not be subtracted again.
     */
    expect(body.width).toBeCloseTo(column.width - 48, 0);
  });
});
