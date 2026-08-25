import { beforeEach, describe, expect, it, vi } from 'vitest';

const listThreads = vi.fn();

vi.mock('$lib/server/repo', () => ({ listThreads: () => listThreads() }));

const { load } = await import('../../src/routes/(app)/+page.server');

/** `redirect()` throws; this unwraps it into something assertable. */
const run = async () => {
  try {
    return { result: await load() };
  } catch (thrown) {
    return { thrown: thrown as { status: number; location: string } };
  }
};

beforeEach(() => listThreads.mockReset());

describe('the root page load', () => {
  it('redirects to the first thread when there is one', async () => {
    listThreads.mockResolvedValue([{ id: 'abc' }, { id: 'def' }]);

    const { thrown } = await run();

    expect(thrown?.status).toBe(307);
    expect(thrown?.location).toBe('/chats/abc');
  });

  /**
   * The regression this file exists for. An empty list used to `error(404)`,
   * which escapes the `(app)` layout — no rail, no thread list, and so no way
   * to create the first thread without editing the URL.
   */
  it('returns instead of erroring when there are no threads', async () => {
    listThreads.mockResolvedValue([]);

    const { result, thrown } = await run();

    expect(thrown).toBeUndefined();
    expect(result).toBeUndefined();
  });
});
