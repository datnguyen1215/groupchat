import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The MCP server is never spawned here.
 *
 * These tests are about the rules around a session — how many may exist, when
 * one is reused, when it is closed — and none of that needs a real browser.
 * `browserServer` is stubbed to a URL nothing listens on, and the client is
 * stubbed to succeed, which leaves the lifecycle as the only thing under test.
 */

const closed: string[] = [];
let connections = 0;
/** Set by a test that wants the next connection to fail. */
let failNext: Error | null = null;

vi.mock('../../src/lib/server/browser/server', () => ({
  browserServer: async () => ({ process: {}, url: 'http://127.0.0.1:1/mcp' }),
  stopBrowserServer: async () => {},
  serverRunning: () => true,
  BROWSER_PORT: 10205,
  STATE_FILE: '/tmp/state.json'
}));

vi.mock('@ai-sdk/mcp', () => ({
  experimental_createMCPClient: async () => {
    if (failNext) {
      const error = failNext;
      failNext = null;
      throw error;
    }
    const id = String(++connections);
    return {
      tools: async () => ({
        browser_navigate: { execute: async () => `page from client ${id}` },
        browser_snapshot: { execute: async () => `snapshot ${id}` }
      }),
      close: async () => {
        closed.push(id);
      }
    };
  }
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {}
}));

const load = async () => import('../../src/lib/server/browser/sessions');

beforeEach(async () => {
  closed.length = 0;
  connections = 0;
  failNext = null;
  const { closeAllSessions } = await load();
  await closeAllSessions();
  vi.useRealTimers();
});

afterEach(async () => {
  const { closeAllSessions } = await load();
  await closeAllSessions();
});

describe('sessionFor', () => {
  it('opens one session per thread', async () => {
    const { sessionFor, liveSessions } = await load();

    await sessionFor('thread-a');
    await sessionFor('thread-b');

    expect(liveSessions().sort()).toEqual(['thread-a', 'thread-b']);
    expect(connections).toBe(2);
  });

  it('reuses the thread session rather than opening a second context', async () => {
    const { sessionFor } = await load();

    const first = await sessionFor('thread-a');
    const second = await sessionFor('thread-a');

    expect(second).toBe(first);
    expect(connections).toBe(1);
  });

  /**
   * The race the map exists to prevent: two agents in one thread calling a
   * browser tool in the same step. Both must land on one context.
   */
  it('opens one context when two calls race for the same thread', async () => {
    const { sessionFor } = await load();

    const [a, b] = await Promise.all([sessionFor('thread-a'), sessionFor('thread-a')]);

    expect(a).toBe(b);
    expect(connections).toBe(1);
  });

  it('refuses past the cap rather than opening more browsers', async () => {
    const { sessionFor, MAX_SESSIONS, BrowserBusyError } = await load();

    for (let i = 0; i < MAX_SESSIONS; i++) await sessionFor(`thread-${i}`);

    await expect(sessionFor('one-too-many')).rejects.toBeInstanceOf(BrowserBusyError);
    expect(connections).toBe(MAX_SESSIONS);
  });

  it('names the threads holding the browsers, so the agent can be told', async () => {
    const { sessionFor, MAX_SESSIONS, BrowserBusyError } = await load();

    for (let i = 0; i < MAX_SESSIONS; i++) await sessionFor(`thread-${i}`);

    const error = await sessionFor('waiting').catch(e => e);
    expect(error).toBeInstanceOf(BrowserBusyError);
    expect((error as InstanceType<typeof BrowserBusyError>).holders).toHaveLength(MAX_SESSIONS);
  });

  it('lets a thread in once another releases its browser', async () => {
    const { sessionFor, closeSession, MAX_SESSIONS } = await load();

    for (let i = 0; i < MAX_SESSIONS; i++) await sessionFor(`thread-${i}`);
    await closeSession('thread-0');

    await expect(sessionFor('now-there-is-room')).resolves.toBeDefined();
  });

  /**
   * A connection that fails must not leave an entry behind. Left there it
   * would hold a slot against the cap forever and be returned to the next
   * caller as if it were a working session.
   */
  it('leaves no session behind when connecting fails', async () => {
    const { sessionFor, liveSessions } = await load();

    failNext = new Error('server refused');
    await expect(sessionFor('thread-a')).rejects.toThrow('server refused');

    expect(liveSessions()).toEqual([]);
  });

  it('retries cleanly after a failed connection', async () => {
    const { sessionFor } = await load();

    failNext = new Error('server refused');
    await sessionFor('thread-a').catch(() => null);

    await expect(sessionFor('thread-a')).resolves.toBeDefined();
  });
});

describe('closeSession', () => {
  it('closes the client and drops the thread', async () => {
    const { sessionFor, closeSession, liveSessions } = await load();

    await sessionFor('thread-a');
    await closeSession('thread-a');

    expect(closed).toEqual(['1']);
    expect(liveSessions()).toEqual([]);
  });

  it('is safe for a thread that never browsed', async () => {
    const { closeSession } = await load();
    await expect(closeSession('never-browsed')).resolves.toBeUndefined();
  });

  it('closes every session at shutdown', async () => {
    const { sessionFor, closeAllSessions, liveSessions } = await load();

    await sessionFor('thread-a');
    await sessionFor('thread-b');
    await closeAllSessions();

    expect(closed).toHaveLength(2);
    expect(liveSessions()).toEqual([]);
  });
});

describe('idle expiry', () => {
  /**
   * The leak this catches is the one no model can be trusted to prevent: a
   * turn that ended without releasing its browser. The sweep runs on the next
   * `sessionFor`, so the clock is moved rather than waited on.
   */
  it('closes a session left untouched past the timeout', async () => {
    const { sessionFor, closeSession, liveSessions, IDLE_TIMEOUT_MS } = await load();

    await sessionFor('abandoned');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + IDLE_TIMEOUT_MS + 1);

    /** Any later call sweeps first. `closeSession` on another thread is enough. */
    await closeSession('unrelated');
    await sessionFor('fresh');

    expect(liveSessions()).toEqual(['fresh']);
    vi.restoreAllMocks();
  });

  it('keeps a session that is still being used', async () => {
    const { sessionFor, liveSessions, IDLE_TIMEOUT_MS } = await load();

    const start = Date.now();
    await sessionFor('busy');

    /** Half the timeout, then used again — which bumps `usedAt`. */
    vi.spyOn(Date, 'now').mockReturnValue(start + IDLE_TIMEOUT_MS / 2);
    await sessionFor('busy');

    vi.spyOn(Date, 'now').mockReturnValue(start + IDLE_TIMEOUT_MS - 1);
    await sessionFor('other');

    expect(liveSessions()).toContain('busy');
    vi.restoreAllMocks();
  });

  /** An expired session must not count against the cap. */
  it('frees a slot when the holder has gone idle', async () => {
    const { sessionFor, MAX_SESSIONS, IDLE_TIMEOUT_MS } = await load();

    for (let i = 0; i < MAX_SESSIONS; i++) await sessionFor(`stale-${i}`);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + IDLE_TIMEOUT_MS + 1);

    await expect(sessionFor('newcomer')).resolves.toBeDefined();
    vi.restoreAllMocks();
  });
});
