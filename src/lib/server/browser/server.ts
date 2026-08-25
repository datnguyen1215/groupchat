/**
 * The Playwright MCP server process.
 *
 * One process for the whole app, spawned the first time an agent reaches for
 * the browser and never respawned on its own. It serves HTTP on
 * `BROWSER_PORT`, and every connection made to it gets its own browser
 * context — which is what lets one thread browse without disturbing another.
 *
 * Nothing here knows about threads or agents. `sessions.ts` connects; this
 * file only guarantees there is something to connect to.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger, since } from '../logger';

const log = logger('browser');

/** In the project's 10200+ range, next free after the preview server. */
export const BROWSER_PORT = 10205;

/**
 * The cookies every browser context starts with.
 *
 * This is the login. Sign into a site once — see `npm run browser:login` — and
 * the file it writes is read into every context the agents open, so nothing
 * has to sign in again.
 *
 * A persistent `--user-data-dir` was the obvious way to do this and does not
 * work: Chromium allows one browser instance per profile directory, so the
 * second thread to open a page is refused with "Browser is already in use".
 * `--isolated` gives each connection its own context, and this file is what
 * they share.
 *
 * Because contexts are in memory, a session refreshed mid-run is not written
 * back. The file is a starting point, not a record — re-run the login when a
 * site signs the agents out.
 */
export const STATE_FILE = `${process.env.HOME}/tmp/groupchat/browser-state.json`;

/**
 * Where the server writes its snapshot files.
 *
 * Given explicitly because the default is `.playwright-mcp/` under the working
 * directory — which is the repository. Scratch output belongs under
 * `~/tmp/groupchat/`, and a directory of stale page dumps does not belong in
 * a checkout at all.
 */
export const OUTPUT_DIR = `${process.env.HOME}/tmp/groupchat/browser-output`;

/**
 * What the browser reports itself as.
 *
 * Headless Chromium announces `HeadlessChrome/...` in its user agent, which is
 * the first thing a site checks when it wants to turn automation away. The
 * version is taken from the browser actually running rather than written down
 * here: a user agent claiming a version the browser does not have is its own
 * signal, and a pinned string would drift every time Playwright updates.
 *
 * This is politeness towards ordinary sites that sniff the UA, not a disguise.
 * The server already hides `navigator.webdriver`, so what is left is the
 * deeper fingerprinting — canvas, WebGL, timing — that no flag addresses.
 */
const userAgent = async () => {
  const { chromium } = await import('playwright');

  /** One short launch per server start, to ask the browser its own version. */
  const build = await chromium
    .launch({ headless: true })
    .then(async browser => {
      const version = browser.version();
      await browser.close();
      return version.match(/[\d.]+/)?.[0];
    })
    .catch(cause => {
      log.warn({ err: cause }, 'could not read browser version');
      return undefined;
    });

  /** No version means no claim: better the default UA than a false one. */
  if (!build) return undefined;

  return (
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    `Chrome/${build} Safari/537.36`
  );
};

/**
 * The window size the pages are laid out at.
 *
 * The headless default is smaller than any real desktop, which changes what a
 * responsive site renders — an agent reading a phone layout of a page it was
 * asked about is reading the wrong page.
 */
const VIEWPORT = '1920x1080';

/** How long to wait for the server to report itself listening. */
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * The server binary, resolved rather than run through `npx`.
 *
 * `npx` is a wrapper process: killing it leaves the server it spawned running,
 * still holding the port and the profile lock, and the next start then fails
 * on both. Spawning the real binary makes the handle we hold the process we
 * mean to stop.
 */
const BINARY = fileURLToPath(
  new URL('../../../../node_modules/.bin/playwright-mcp', import.meta.url)
);

type Server = {
  process: ChildProcess;
  url: string;
};

/**
 * Survives Vite's module reloads.
 *
 * Without it every save in dev spawns another server and leaks the last one,
 * along with its Chromium. The handle has to outlive the module, so it hangs
 * off the one object that does.
 */
const GLOBAL_KEY = Symbol.for('groupchat.browser.server');
const store = globalThis as unknown as Record<symbol, Promise<Server> | undefined>;

/**
 * The line the server prints once it is accepting connections.
 *
 * Waited for rather than assumed: connecting to a port that is not listening
 * yet fails, and the first browser call of the app's life is exactly when that
 * race happens.
 *
 * It arrives on stderr, not stdout — stdout is reserved for the stdio
 * transport's JSON-RPC, so everything human-readable goes to the other stream
 * even when the server is serving HTTP. Both are watched rather than only the
 * one it currently uses.
 */
const READY = /Listening on (http:\/\/\S+)/;

/**
 * Stops the server and everything it started.
 *
 * Negating the pid signals the process group, which is what reaches Chromium.
 * Falls back to the plain kill if the group is already gone — a server that
 * died on its own leaves nothing to signal.
 */
const kill = (child: ChildProcess) => {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill();
  }
};

/**
 * Makes sure there is a state file to read.
 *
 * The server will not start without one, and on a fresh checkout nobody has
 * logged in yet. An empty state is a browser with no cookies, which is the
 * right starting point — not a reason to fail.
 */
const ensureState = () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  if (existsSync(STATE_FILE)) return;
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
  log.info({ file: STATE_FILE }, 'empty browser state created');
};

const launch = async (): Promise<Server> => {
  /** Resolved before the spawn, because it needs the browser's own version. */
  const agent = await userAgent();

  return new Promise((resolve, reject) => {
    const start = Date.now();
    ensureState();

    const child = spawn(
      BINARY,
      [
        '--headless',
        '--port',
        String(BROWSER_PORT),
        /**
         * One context per connection, which is what lets two threads browse at
         * once. Cookies come from `STATE_FILE` instead of a profile on disk.
         */
        '--isolated',
        '--storage-state',
        STATE_FILE,
        /** DeepSeek reads no images, so a screenshot payload is pure waste. */
        '--image-responses',
        'omit',
        '--viewport-size',
        VIEWPORT,
        ...(agent ? ['--user-agent', agent] : []),
        '--output-dir',
        OUTPUT_DIR,
        '--no-sandbox'
      ],
      /**
       * Its own process group, so shutdown can signal the whole tree.
       * Chromium is a grandchild — killing only the server leaves a browser
       * running, holding the profile lock that the next start needs.
       */
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true }
    );

    /** Cleared once resolved, so a later crash does not reject a settled promise. */
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      kill(child);
      log.error({ ms: since(start) }, 'server start timed out');
      reject(new Error('The browser server did not start in time.'));
    }, STARTUP_TIMEOUT_MS);

    const watch = (chunk: Buffer) => {
      const line = chunk.toString();
      const ready = READY.exec(line);

      if (!ready || settled) {
        log.debug({ line: line.trim() }, 'server output');
        return;
      }

      settled = true;
      clearTimeout(timer);
      log.info({ port: BROWSER_PORT, ms: since(start) }, 'server ready');
      resolve({ process: child, url: `${ready[1]}/mcp` });
    };

    child.stdout?.on('data', watch);
    child.stderr?.on('data', watch);

    child.on('error', cause => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log.error({ err: cause }, 'server failed to spawn');
      reject(cause);
    });

    /**
     * A server that dies takes every session with it. The handle is dropped so
     * the next browser call spawns a fresh one rather than connecting to a
     * port nothing is listening on.
     */
    child.on('exit', (code, signal) => {
      log.warn({ code, signal }, 'server exited');
      if (store[GLOBAL_KEY]) store[GLOBAL_KEY] = undefined;
    });
  });
};

/**
 * The running server, started if it is not already.
 *
 * The *promise* is cached rather than the result, so two threads reaching for
 * the browser at the same moment wait on one spawn instead of racing to start
 * two servers on the same port.
 */
export const browserServer = (): Promise<Server> => {
  const running = store[GLOBAL_KEY];
  if (running) return running;

  /** Dropped on failure so the next call retries rather than replaying the error. */
  const starting = launch().catch(cause => {
    store[GLOBAL_KEY] = undefined;
    throw cause;
  });

  store[GLOBAL_KEY] = starting;
  return starting;
};

/** Whether a server is currently running. Used by tests and shutdown. */
export const serverRunning = () => Boolean(store[GLOBAL_KEY]);

/**
 * Stops the server.
 *
 * The handle is cleared first: whatever happens to the process, the next
 * browser call should spawn rather than reuse a dying one.
 */
export const stopBrowserServer = async () => {
  const running = store[GLOBAL_KEY];
  if (!running) return;
  store[GLOBAL_KEY] = undefined;

  const server = await running.catch(() => null);
  if (!server) return;

  kill(server.process);
  log.info({}, 'server stopped');
};
