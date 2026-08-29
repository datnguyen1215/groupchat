import { describe, expect, it, vi } from 'vitest';

/**
 * The generated thread title: when it runs, when it refuses to, and what it
 * does with the untidy line a model actually returns.
 *
 * The model is mocked at `generateText` — this is about the guard and the
 * cleaning, not about DeepSeek.
 */
type Thread = { id: string; name: string; titled: boolean };

const build = async (options: { thread?: Thread | null; messages?: string[]; reply?: string }) => {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env: {} }));
  vi.doMock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

  const thread =
    options.thread === undefined ? { id: 't1', name: 'New thread', titled: false } : options.thread;
  const messages = options.messages ?? ['why are webhook retries doubling?'];

  const titleThread = vi.fn(async () => undefined);
  const generateText = vi.fn(async () => ({ text: options.reply ?? 'Webhook retry duplication' }));

  vi.doMock('ai', () => ({ generateText }));
  vi.doMock('../../src/lib/server/repo', () => ({
    getThread: async () => thread,
    listEntries: async () =>
      messages.map((body, i) => ({
        id: `e${i}`,
        kind: 'message',
        author: 'Dat',
        paragraphs: [body]
      })),
    titleThread
  }));

  const { generateTitle } = await import('../../src/lib/server/ai/title');
  return { generateTitle, titleThread, generateText };
};

describe('generateTitle', () => {
  it('names an untitled thread from its transcript', async () => {
    const { generateTitle, titleThread } = await build({});

    await generateTitle('t1');

    expect(titleThread).toHaveBeenCalledWith('t1', 'Webhook retry duplication');
  });

  it('sends the transcript to the model', async () => {
    const { generateTitle, generateText } = await build({
      messages: ['why are webhook retries doubling?', 'The scheduler enqueues twice.']
    });

    await generateTitle('t1');

    const [[call]] = generateText.mock.calls as unknown as [[{ prompt: string }]];
    expect(call.prompt).toContain('why are webhook retries doubling?');
    expect(call.prompt).toContain('The scheduler enqueues twice.');
  });

  /* The whole point of the flag: it runs once and never again. */
  it('skips a thread that already has a title', async () => {
    const { generateTitle, titleThread, generateText } = await build({
      thread: { id: 't1', name: 'Webhook retry duplication', titled: true }
    });

    await generateTitle('t1');

    expect(generateText).not.toHaveBeenCalled();
    expect(titleThread).not.toHaveBeenCalled();
  });

  /* A person who renamed it back to the default still chose that name. */
  it('skips a titled thread even when its name is the default', async () => {
    const { generateTitle, titleThread } = await build({
      thread: { id: 't1', name: 'New thread', titled: true }
    });

    await generateTitle('t1');

    expect(titleThread).not.toHaveBeenCalled();
  });

  it('does nothing when the thread is gone', async () => {
    const { generateTitle, titleThread, generateText } = await build({ thread: null });

    await generateTitle('t1');

    expect(generateText).not.toHaveBeenCalled();
    expect(titleThread).not.toHaveBeenCalled();
  });

  /* Nothing was said, so there is nothing to name it after — and `titled` stays
     false, so the next turn gets another go. */
  it('does not title an empty thread', async () => {
    const { generateTitle, titleThread, generateText } = await build({ messages: [] });

    await generateTitle('t1');

    expect(generateText).not.toHaveBeenCalled();
    expect(titleThread).not.toHaveBeenCalled();
  });

  describe('cleaning the model reply', () => {
    const cases: [string, string, string][] = [
      ['strips wrapping quotes', '"Webhook retry duplication"', 'Webhook retry duplication'],
      ['strips a Title: prefix', 'Title: Webhook retries', 'Webhook retries'],
      ['strips a trailing period', 'Webhook retries firing twice.', 'Webhook retries firing twice'],
      ['keeps only the first line', 'Webhook retries\n\nThis covers the...', 'Webhook retries'],
      ['trims surrounding space', '   Webhook retries   ', 'Webhook retries']
    ];

    for (const [name, reply, expected] of cases) {
      it(name, async () => {
        const { generateTitle, titleThread } = await build({ reply });

        await generateTitle('t1');

        expect(titleThread).toHaveBeenCalledWith('t1', expected);
      });
    }

    it('truncates a title too long for the sidebar', async () => {
      const { generateTitle, titleThread } = await build({
        reply: 'A very long explanation of why the webhook retry scheduler is enqueueing twice'
      });

      await generateTitle('t1');

      const [[, name]] = titleThread.mock.calls as unknown as [[string, string]];
      expect(name.length).toBeLessThanOrEqual(48);
      expect(name.endsWith('…')).toBe(true);
    });

    it('writes nothing when the model returns only punctuation', async () => {
      const { generateTitle, titleThread } = await build({ reply: '"."' });

      await generateTitle('t1');

      expect(titleThread).not.toHaveBeenCalled();
    });
  });
});
