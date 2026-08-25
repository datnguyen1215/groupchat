/**
 * One browser session per thread.
 *
 * A session is an MCP client connection, and the server hands each connection
 * its own browser context. So two threads browsing at once cannot see each
 * other's pages, and neither has to wait for the other — the isolation is the
 * transport's, not a lock we hold.
 *
 * Cookies are still shared, because every context is drawn from the one
 * profile directory on disk. That is the point: sign into a site once by hand
 * and every thread is already signed in.
 *
 * Lifecycle belongs to this module rather than to the agents. A model that
 * forgets to close a session leaks a browser context for the life of the
 * process, and models forget — they run out of steps, they throw, they decide
 * the work is done and stop. Every session here is closed by a rule: idle
 * expiry, eviction, thread deletion or shutdown.
 */

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger, since } from '../logger';
import { browserServer } from './server';

const log = logger('browser');

/**
 * How many threads may hold a browser at once.
 *
 * Each session is a live browser context — real memory, real CPU. The cap is
 * what stops a busy app from opening one per thread until the machine gives
 * out. A thread that asks for the browser while the cap is full is told to
 * wait rather than being queued silently, so the agent can say so in chat
 * instead of appearing to hang.
 */
export const MAX_SESSIONS = 3;

/** How long a session may go untouched before it is closed. */
export const IDLE_TIMEOUT_MS = 10 * 60_000;

/** How often expired sessions are swept. */
const SWEEP_INTERVAL_MS = 60_000;

type Session = {
  client: Awaited<ReturnType<typeof createMCPClient>>;
  tools: Record<string, any>;
  /** Bumped on every use. What the idle sweep and the eviction order read. */
  usedAt: number;
};

/**
 * A session being opened, with the result hung off it once it arrives.
 *
 * The `settled` field is what lets the sweep tell an open session from one
 * still connecting without awaiting anything — see `sweep`.
 */
type Opening = Promise<Session> & { settled?: Session };

/**
 * Sessions in flight, keyed by thread.
 *
 * Holds the *promise*, not the session: two agents in one thread calling a
 * browser tool in the same step must wait on one connection rather than
 * opening two contexts for a thread that should have one.
 */

const GLOBAL_KEY = Symbol.for('groupchat.browser.sessions');
const store = globalThis as unknown as Record<symbol, Map<string, Opening> | undefined>;

const sessions = (): Map<string, Opening> => {
  const existing = store[GLOBAL_KEY];
  if (existing) return existing;
  const fresh = new Map<string, Opening>();
  store[GLOBAL_KEY] = fresh;
  return fresh;
};

/** Raised when the cap is full. Carried to the model as words, not a stack trace. */
export class BrowserBusyError extends Error {
  constructor(public readonly holders: string[]) {
    super('Every browser is in use.');
    this.name = 'BrowserBusyError';
  }
}

const connect = async (threadId: string): Promise<Session> => {
  const start = Date.now();
  const server = await browserServer();

  const client = await createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL(server.url))
  });

  const tools = await client.tools();
  log.info({ threadId, ms: since(start) }, 'session opened');

  return { client, tools, usedAt: Date.now() };
};

/** Closes one session and drops it. Never throws — cleanup is not worth failing a turn over. */
const shut = async (threadId: string, pending: Opening, why: string) => {
  sessions().delete(threadId);
  const session = await pending.catch(() => null);
  if (!session) return;

  await session.client.close().catch(cause => {
    log.warn({ threadId, err: cause }, 'session close failed');
  });
  log.info({ threadId, why }, 'session closed');
};

/**
 * Closes sessions that have gone idle.
 *
 * Runs on a timer rather than at the end of a turn, because a turn is not
 * where a session's usefulness ends — the next agent in the same thread wants
 * the page the last one left, still logged in.
 */
const sweep = async () => {
  const now = Date.now();
  const live = sessions();

  for (const [threadId, pending] of [...live]) {
    /**
     * Only sessions that have finished connecting are swept. A pending one is
     * left alone: awaiting it would make the sweep wait on it, and a sweep run
     * *from* `sessionFor` would then wait on the claim it had just made — a
     * deadlock between a thread and its own browser.
     */
    const session = pending.settled;
    if (!session) continue;

    if (now - session.usedAt < IDLE_TIMEOUT_MS) continue;
    await shut(threadId, pending, 'idle');
  }
};

/** The sweep timer, on `globalThis` so a module reload does not start a second one. */
const TIMER_KEY = Symbol.for('groupchat.browser.sweeper');
const timers = store as unknown as Record<symbol, NodeJS.Timeout | undefined>;

const startSweeping = () => {
  if (timers[TIMER_KEY]) return;
  const timer = setInterval(() => {
    sweep().catch(cause => log.warn({ err: cause }, 'sweep failed'));
  }, SWEEP_INTERVAL_MS);
  /** Never the reason the process stays alive. */
  timer.unref?.();
  timers[TIMER_KEY] = timer;
};

/**
 * The thread's browser session, opened if it has none.
 *
 * @throws {BrowserBusyError} When every browser is held by another thread.
 * The caller turns this into a sentence the agent can act on — waiting is a
 * decision for the orchestrator, not something to do silently inside a tool.
 */
export const sessionFor = async (threadId: string): Promise<Session> => {
  const live = sessions();
  const existing = live.get(threadId);

  if (existing) {
    const session = await existing.catch(() => null);
    if (session) {
      session.usedAt = Date.now();
      return session;
    }
    /** A failed connection left an entry behind. Clear it and open fresh. */
    live.delete(threadId);
  }

  startSweeping();

  /**
   * The slot is claimed before anything is awaited.
   *
   * Sweeping and connecting both suspend, and two agents in one thread can
   * call a browser tool in the same step — so a check that reads the map,
   * awaits, then writes to it lets both callers past and opens two contexts
   * for a thread that should have one. Storing the promise first closes that
   * window: the second caller finds the entry and waits on it.
   */
  const open = async (): Promise<Session> => {
    /**
     * Swept before the cap is checked, so a thread is not turned away for
     * sessions that have already expired but not yet been collected. This
     * thread's own claim is in the map by now, hence the `- 1`.
     */
    await sweep();

    if (live.size - 1 >= MAX_SESSIONS) {
      log.warn({ threadId, live: live.size - 1 }, 'browser cap reached');
      throw new BrowserBusyError([...live.keys()].filter(id => id !== threadId));
    }

    const session = await connect(threadId);
    /** Recorded with the resolve, so the sweep can read it without awaiting. */
    opening.settled = session;
    return session;
  };

  const opening: Opening = open();
  live.set(threadId, opening);

  /** Dropped on failure so the next call retries instead of replaying the error. */
  return opening.catch(cause => {
    live.delete(threadId);
    if (!(cause instanceof BrowserBusyError)) {
      log.error({ threadId, err: cause }, 'session failed to open');
    }
    throw cause;
  });
};

/** Closes a thread's session, if it has one. Safe to call for a thread that never browsed. */
export const closeSession = async (threadId: string, why = 'released') => {
  const pending = sessions().get(threadId);
  if (pending) await shut(threadId, pending, why);
};

/** How many sessions are live. For tests and for telling an agent what it is waiting on. */
export const liveSessions = () => [...sessions().keys()];

/** Closes every session. Shutdown, and the reset between tests. */
export const closeAllSessions = async () => {
  await Promise.all([...sessions().keys()].map(id => closeSession(id, 'shutdown')));
};
