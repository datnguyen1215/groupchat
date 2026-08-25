import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { browserTools } from '../../src/lib/server/browser';
import { closeAllSessions, sessionFor } from '../../src/lib/server/browser/sessions';
import { stopBrowserServer } from '../../src/lib/server/browser/server';

/**
 * The one test that drives a real browser.
 *
 * Everything else in this suite mocks the MCP server, which proves the rules
 * around a session but not that a session does anything. This spawns the real
 * server, opens real pages and clicks a real link — the only place the
 * `ref=eNN` handles, the snapshot format and the transport's per-connection
 * isolation are actually exercised.
 *
 * It is slow (a browser launch) and it needs the network, so it is skipped
 * unless `BROWSER_LIVE=1`. Run it with:
 *   BROWSER_LIVE=1 npx vitest run tests/unit/browser-live.test.ts
 */

const live = process.env.BROWSER_LIVE === '1';

/** example.com is stable, tiny and exists to be fetched by tests. */
const PAGE = 'https://example.com';

/**
 * Every case starts with no sessions open.
 *
 * There are more cases here than the cap allows browsers, and they share one
 * server — so without this the fourth is turned away by the cap rather than
 * testing what it means to.
 */
beforeEach(async () => {
  if (live) await closeAllSessions();
});

afterAll(async () => {
  if (!live) return;
  await closeAllSessions();
  await stopBrowserServer();
});

describe.runIf(live)('a real browser', () => {
  it('opens a page and returns it as refs the agent can act on', async () => {
    const tools = browserTools('live-a') as any;

    const page = (await tools.browser_navigate.execute({ url: PAGE }, {})) as string;

    expect(page).toContain('Example Domain');
    /** The handles the acting tools take. Without them the agent cannot click. */
    expect(page).toMatch(/\[ref=e\d+\]/);
  }, 120_000);

  it('follows a link by ref and lands somewhere else', async () => {
    const tools = browserTools('live-click') as any;

    const page = (await tools.browser_navigate.execute({ url: PAGE }, {})) as string;
    const ref = /link "[^"]*" \[ref=(e\d+)\]/.exec(page)?.[1];
    expect(ref).toBeDefined();

    const after = (await tools.browser_click.execute(
      { element: 'the link to iana.org', ref },
      {}
    )) as string;

    /** Clicking returns the new page, which is why agents need no snapshot after. */
    expect(after).toContain('Page URL:');
    expect(after).toContain('iana.org');
  }, 120_000);

  /**
   * The claim the whole design rests on: one connection per thread, one browser
   * context per connection. If this fails, two threads share a page and the
   * per-thread session is a fiction.
   */
  it('keeps two threads on separate pages', async () => {
    const a = browserTools('live-one') as any;
    const b = browserTools('live-two') as any;

    await a.browser_navigate.execute({ url: PAGE }, {});
    await b.browser_navigate.execute({ url: 'https://www.iana.org/domains/reserved' }, {});

    const seenByA = (await a.browser_snapshot.execute({}, {})) as string;
    const seenByB = (await b.browser_snapshot.execute({}, {})) as string;

    expect(seenByA).toContain('example.com');
    expect(seenByB).toContain('iana.org');
  }, 120_000);

  it('reuses one context for a thread across separate tool calls', async () => {
    const first = await sessionFor('live-sticky');
    const second = await sessionFor('live-sticky');

    expect(second).toBe(first);
  }, 120_000);
});
