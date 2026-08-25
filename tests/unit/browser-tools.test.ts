import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The tools' job is translation: an MCP content block becomes text the model
 * can read, and every failure becomes a sentence rather than an exception. A
 * tool that throws ends the agent's turn, which is the wrong answer to a page
 * that would not load.
 *
 * The session layer is stubbed. What it does is tested next door; here it is
 * only a source of tools and of the one error the tools have to translate.
 */

let lastCall: { name: string; input: Record<string, unknown> } | null = null;
let reply: unknown = { content: [{ type: 'text', text: 'the page' }] };
let raise: Error | null = null;
const releases: string[] = [];

class FakeBusy extends Error {
  constructor(public readonly holders: string[]) {
    super('Every browser is in use.');
    this.name = 'BrowserBusyError';
  }
}

vi.mock('../../src/lib/server/browser/sessions', () => ({
  BrowserBusyError: FakeBusy,
  sessionFor: async () => {
    if (raise) throw raise;
    return {
      tools: {
        browser_navigate: {
          execute: async (input: Record<string, unknown>) => {
            lastCall = { name: 'browser_navigate', input };
            return reply;
          }
        },
        browser_click: {
          execute: async (input: Record<string, unknown>) => {
            lastCall = { name: 'browser_click', input };
            return reply;
          }
        },
        browser_type: {
          execute: async (input: Record<string, unknown>) => {
            lastCall = { name: 'browser_type', input };
            return reply;
          }
        },
        browser_snapshot: { execute: async () => reply },
        browser_find: { execute: async () => reply },
        browser_navigate_back: {
          execute: async (input: Record<string, unknown>) => {
            lastCall = { name: 'browser_navigate_back', input };
            return reply;
          }
        }
      }
    };
  },
  closeSession: async (threadId: string) => {
    releases.push(threadId);
  },
  liveSessions: () => [],
  MAX_SESSIONS: 3,
  IDLE_TIMEOUT_MS: 600_000
}));

vi.mock('../../src/lib/server/browser/server', () => ({
  stopBrowserServer: async () => {},
  serverRunning: () => false,
  BROWSER_PORT: 10205,
  STATE_FILE: '/tmp/state.json'
}));

const load = async () => (await import('../../src/lib/server/browser')).browserTools('thread-a');

const run = async (name: string, input: Record<string, unknown> = {}) => {
  const tools = await load();
  return (await (tools as any)[name].execute(input, {})) as string;
};

beforeEach(() => {
  lastCall = null;
  raise = null;
  releases.length = 0;
  reply = { content: [{ type: 'text', text: 'the page' }] };
});

describe('the tool surface', () => {
  /**
   * The server offers twenty-four tools. Most are wrong for these agents:
   * screenshots a text-only model cannot read, arbitrary code execution, and
   * tab handling that belongs to the session layer rather than the model.
   */
  it('exposes only the tools an agent should have', async () => {
    const tools = await load();

    expect(Object.keys(tools).sort()).toEqual([
      'browser_back',
      'browser_click',
      'browser_find',
      'browser_navigate',
      'browser_reset',
      'browser_snapshot',
      'browser_type'
    ]);
  });

  it('offers no screenshot, no tab control and no code execution', async () => {
    const names = Object.keys(await load());

    expect(names).not.toContain('browser_take_screenshot');
    expect(names).not.toContain('browser_tabs');
    expect(names).not.toContain('browser_run_code_unsafe');
    expect(names).not.toContain('browser_close');
  });
});

describe('reading a result', () => {
  it('unwraps MCP content blocks into plain text', async () => {
    expect(await run('browser_navigate', { url: 'https://example.com' })).toBe('the page');
  });

  it('joins several text blocks', async () => {
    reply = {
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' }
      ]
    };
    expect(await run('browser_snapshot')).toBe('first\nsecond');
  });

  /** An image block reaching a text-only model is noise; only text survives. */
  it('drops non-text blocks', async () => {
    reply = {
      content: [
        { type: 'image', data: 'iVBOR...' },
        { type: 'text', text: 'the page' }
      ]
    };
    expect(await run('browser_snapshot')).toBe('the page');
  });

  it('passes a plain string through', async () => {
    reply = 'already text';
    expect(await run('browser_snapshot')).toBe('already text');
  });
});

describe('a page too long to show', () => {
  /**
   * A long article's snapshot runs past a hundred thousand characters — more
   * than the model's whole context. It has to be cut, and the cut has to be
   * announced: a model that is not told believes the page ended there.
   */
  it('truncates and says so', async () => {
    reply = { content: [{ type: 'text', text: 'x'.repeat(200_000) }] };

    const result = await run('browser_navigate', { url: 'https://en.wikipedia.org' });

    expect(result.length).toBeLessThan(30_000);
    expect(result).toContain('cut off');
    expect(result).toContain('browser_find');
  });

  it('leaves a page that fits alone', async () => {
    reply = { content: [{ type: 'text', text: 'short page' }] };

    expect(await run('browser_snapshot')).toBe('short page');
  });
});

describe('when something goes wrong', () => {
  /**
   * Every one of these returns rather than throws. The agent has to be able to
   * say what happened in chat, which it cannot do from a turn that ended.
   */
  it('reports a failed page load as words', async () => {
    raise = new Error('net::ERR_NAME_NOT_RESOLVED');

    const result = await run('browser_navigate', { url: 'https://nope.invalid' });

    expect(result).toContain('could not');
    expect(result).toContain('ERR_NAME_NOT_RESOLVED');
  });

  it('tells the agent to stop rather than retry when every browser is taken', async () => {
    raise = new FakeBusy(['thread-b', 'thread-c', 'thread-d']);

    const result = await run('browser_navigate', { url: 'https://example.com' });

    expect(result).toContain('3 browsers are in use');
    expect(result).toContain('Do not retry');
    expect(result).toContain('orchestrator');
  });

  it('never throws out of a tool', async () => {
    raise = new Error('anything at all');

    await expect(run('browser_click', { element: 'a button', ref: 'e1' })).resolves.toContain(
      'could not'
    );
  });
});

describe('acting on a page', () => {
  it('clicks by ref', async () => {
    await run('browser_click', { element: 'the Sign in button', ref: 'e42' });

    expect(lastCall).toEqual({
      name: 'browser_click',
      input: { element: 'the Sign in button', ref: 'e42' }
    });
  });

  it('types, and can submit in the same call', async () => {
    await run('browser_type', {
      element: 'the search box',
      ref: 'e7',
      text: 'web scraping',
      submit: true
    });

    expect(lastCall?.input).toMatchObject({ ref: 'e7', text: 'web scraping', submit: true });
  });

  /** Named `browser_back` for the agent, but it is the server's navigate_back. */
  it('maps back onto the server tool', async () => {
    await run('browser_back');

    expect(lastCall?.name).toBe('browser_navigate_back');
  });
});

describe('browser_reset', () => {
  it('releases the thread session', async () => {
    const result = await run('browser_reset');

    expect(releases).toEqual(['thread-a']);
    expect(result).toContain('reset');
  });
});
