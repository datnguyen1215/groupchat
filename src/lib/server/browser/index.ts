/**
 * The agents' reach into a live web page: read it, and act on it.
 *
 * `web_search` finds pages; this opens them. It is the answer to everything
 * search cannot do — a page whose content is behind a click, a list that pages,
 * a site the agent is already signed into.
 *
 * The tools are the Playwright MCP server's, renamed and re-described. Five of
 * its twenty-four are exposed; the rest are either useless to a text-only model
 * (screenshots), dangerous (`browser_run_code_unsafe`), or ours to manage and
 * not the model's (`browser_tabs`, `browser_close`).
 */

import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { logger } from '../logger';
import { BrowserBusyError, closeSession, liveSessions, sessionFor } from './sessions';
import { OUTPUT_DIR } from './server';

const log = logger('browser');

export {
  closeAllSessions,
  closeSession,
  liveSessions,
  MAX_SESSIONS,
  IDLE_TIMEOUT_MS
} from './sessions';
export { stopBrowserServer, serverRunning, BROWSER_PORT, STATE_FILE } from './server';

/**
 * A snapshot is the agent's only view of the page, and some pages are enormous
 * — a long encyclopedia article runs past a hundred thousand characters, which
 * is more than the model's whole context.
 *
 * Truncating loses the tail of the page, and the agent is told so plainly: a
 * cut it knows about is a cut it can work around by searching within the page
 * or following a link. A silent one just makes the model believe the page
 * ended early.
 */
const MAX_RESULT_CHARS = 24_000;

const CUT_NOTE =
  '\n\n[This page was too long to show in full and was cut off here. ' +
  'What you can see above is real; there is more below it. Use browser_find to ' +
  'look for something further down, or follow a link to a smaller page.]';

/** MCP returns content blocks; the agent wants the text. */
const flatten = (result: unknown): string => {
  if (typeof result === 'string') return result;

  const blocks = (result as { content?: { type: string; text?: string }[] })?.content;
  if (!Array.isArray(blocks)) return JSON.stringify(result);

  return blocks
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n');
};

const clip = (text: string) =>
  text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) + CUT_NOTE : text;

/**
 * The link the server leaves in place of a snapshot.
 *
 * Rather than return the page, it writes the accessibility tree to a file in
 * its output directory and refers to it — which is useful to a client that can
 * open files and useless to a model that cannot. There is no flag to turn this
 * off, so the file is read back and put where the link was.
 */
const SNAPSHOT_LINK = /^[-*]?[ \t]*\[Snapshot\]\(([^)]+)\)[ \t]*$/m;

const inlineSnapshot = async (text: string, outputDir: string) => {
  const link = SNAPSHOT_LINK.exec(text);
  if (!link) return text;

  /**
   * The link is relative to the server's working directory, not to its output
   * directory — but the file it names is the one the server just wrote there,
   * so the basename is what identifies it.
   */
  const target = link[1];
  const path = isAbsolute(target) ? target : resolve(outputDir, basename(target));
  const page = await readFile(path, 'utf8').catch(cause => {
    /** The page is genuinely lost if this fails, so it is an error, not a warning. */
    log.error({ path, err: cause }, 'snapshot file unreadable');
    return null;
  });

  return page ? text.replace(link[0], page.trimEnd()) : text;
};

/**
 * What an agent is told when every browser is taken.
 *
 * Phrased as a situation to report rather than an error to retry. A model that
 * reads "failed" tries again immediately, which is exactly what a full cap
 * cannot serve; a model that reads this says so in chat and lets the
 * orchestrator decide whether to wait or to do something else.
 */
const busyMessage = (holders: string[]) =>
  `All ${holders.length} browsers are in use by other conversations right now. ` +
  'Do not retry — say in chat that the browser is busy, and either work with what ' +
  'you already have or let the orchestrator decide whether to wait. ' +
  'A browser frees up when another conversation finishes with it.';

/**
 * Runs one MCP browser tool for a thread.
 *
 * Every failure comes back as words rather than an exception. A tool that
 * throws ends the agent's turn; a tool that explains lets it recover — say the
 * page would not load, try a different one, or report the problem in chat.
 */
const call = async (threadId: string, name: string, input: Record<string, unknown>) => {
  try {
    const session = await sessionFor(threadId);
    const mcpTool = session.tools[name];

    if (!mcpTool) {
      log.error({ threadId, tool: name }, 'tool missing from server');
      return `The browser does not support ${name}.`;
    }

    const result = await mcpTool.execute(input, {});
    return clip(await inlineSnapshot(flatten(result), OUTPUT_DIR));
  } catch (cause) {
    if (cause instanceof BrowserBusyError) return busyMessage(cause.holders);

    const detail = cause instanceof Error ? cause.message : String(cause);
    log.warn({ threadId, tool: name, err: cause }, 'browser call failed');
    return `The browser could not do that: ${detail}`;
  }
};

/**
 * Where a page's interactive elements are addressed from.
 *
 * The server calls this `target`; the agent is told "ref" because that is what
 * the snapshot prints beside every element. Renaming it here would mean the
 * model reading `[ref=e42]` and being asked for a `target`.
 */
const REF = z
  .string()
  .describe('The element\'s ref from the last snapshot, e.g. "e42". Not a CSS selector.');

const ELEMENT = z
  .string()
  .describe('What you are acting on, in your own words, e.g. "the Sign in button". For the log.');

/**
 * The browser tools, bound to one thread.
 *
 * Descriptions carry the loop the agent has to run — act, read the snapshot it
 * returns, act again — because a model that does not know a snapshot comes back
 * will call `browser_snapshot` after every single click.
 */
export const browserTools = (threadId: string) => ({
  browser_navigate: tool({
    description:
      'Open a web page in your browser and return what is on it. Use this when a search ' +
      'result is not enough and you need the page itself — the full text of an article, ' +
      'something behind a click, or a site you are already signed into. ' +
      'Returns a snapshot: the page as a list of elements, each with a ref like [ref=e42]. ' +
      'Refs are how you click and type. They change on every page, so use the ones from ' +
      'the most recent snapshot.',
    inputSchema: z.object({
      url: z.string().describe('The full URL, including https://.')
    }),
    execute: ({ url }) => call(threadId, 'browser_navigate', { url })
  }),

  browser_snapshot: tool({
    description:
      'Re-read the current page. You rarely need this — clicking and typing already ' +
      'return a fresh snapshot. Use it when the page changed on its own, or when you ' +
      'have lost track of what is on screen.',
    inputSchema: z.object({}),
    execute: () => call(threadId, 'browser_snapshot', {})
  }),

  browser_click: tool({
    description:
      'Click something on the page: a link, a button, a tab, a "show more". ' +
      'Returns the page as it is after the click, so you do not need to snapshot again.',
    inputSchema: z.object({ element: ELEMENT, ref: REF }),
    execute: ({ element, ref }) => call(threadId, 'browser_click', { element, target: ref })
  }),

  browser_type: tool({
    description:
      'Type into a text box — a search field, a form input. ' +
      'Returns the page afterwards. Set submit when the box should be submitted, ' +
      'which saves you finding and clicking the button.',
    inputSchema: z.object({
      element: ELEMENT,
      ref: REF,
      text: z.string().describe('What to type.'),
      submit: z.boolean().optional().describe('Press Enter after typing. Use for search boxes.')
    }),
    execute: ({ element, ref, text, submit }) =>
      call(threadId, 'browser_type', { element, target: ref, text, submit })
  }),

  browser_find: tool({
    description:
      'Find text on the current page without reading all of it. Use this on a long page, ' +
      'and when a page came back cut off — what you are looking for may be below the cut.',
    inputSchema: z.object({
      text: z.string().describe('The text to look for on the page.')
    }),
    execute: ({ text }) => call(threadId, 'browser_find', { text })
  }),

  browser_back: tool({
    description: 'Go back to the previous page. Returns that page.',
    inputSchema: z.object({}),
    execute: () => call(threadId, 'browser_navigate_back', {})
  }),

  /**
   * The one lifecycle call the model gets, and it is deliberately not "close".
   *
   * When to *stop* browsing is ours to decide — a model asked to release its
   * session forgets, and the context leaks. When a session has gone *bad* is
   * something only the model can see: a stale login, a consent wall it cannot
   * dismiss, a page wedged mid-load. So it may throw a session away, and may
   * not decide the work is over.
   */
  browser_reset: tool({
    description:
      'Throw away your browser and start clean. Use this only when the browser is stuck — ' +
      'a page that will not load, a cookie banner you cannot dismiss, a site that logged ' +
      'you out. Not for finishing up: you do not need to close the browser when you are done.',
    inputSchema: z.object({}),
    execute: async () => {
      await closeSession(threadId, 'reset');
      return 'Browser reset. The next page you open starts fresh.';
    }
  })
});

/** Which threads hold a browser. For logging and for the busy message. */
export const browserHolders = liveSessions;
