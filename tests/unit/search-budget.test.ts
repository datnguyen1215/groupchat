import { describe, expect, it, vi } from 'vitest';

/**
 * The `web_search` tool in `tools.ts` is `research/`'s search plus a per-turn
 * budget. The budget is what is tested here; the HTTP has its own file.
 */
const build = async (searched: Set<string>, hits: unknown[] = []) => {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env: { SERPEX_API_KEY: 'k' } }));
  vi.doMock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));
  vi.doMock('../../src/lib/server/repo', () => ({
    listDocuments: async () => [],
    getDocument: async () => null,
    createDocument: async () => 'doc-1',
    deleteDocument: async () => undefined,
    updateDocument: async () => undefined,
    appendMessage: async () => 'entry-1',
    listSkills: async () => [],
    getSkill: async () => null,
    listAgents: async () => []
  }));

  const search = vi.fn(async () => hits);
  vi.doMock('../../src/lib/server/research', () => ({
    search,
    researchTools: {
      web_search: { description: 'Search the open web.', inputSchema: {} }
    }
  }));

  const { workerTools } = await import('../../src/lib/server/ai/tools');
  const tools = workerTools({ threadId: 't1', agentId: 'a1', tag: 'w', searched });

  /** The tool's second argument is the SDK's execution options; the budget
   * reads none of them, so an empty one is cast through rather than faked. */
  const options = {} as Parameters<NonNullable<typeof tools.web_search.execute>>[1];

  return { run: (query: string) => tools.web_search.execute!({ query }, options), search };
};

describe('web_search budget', () => {
  it('searches and returns the hits', async () => {
    const { run, search } = await build(new Set(), [{ title: 'A', url: 'https://a', snippet: 's' }]);
    expect(await run('foxes')).toEqual([{ title: 'A', url: 'https://a', snippet: 's' }]);
    expect(search).toHaveBeenCalledOnce();
  });

  it('refuses the same query twice, ignoring case and padding', async () => {
    const { run, search } = await build(new Set(), [{ title: 'A', url: 'https://a', snippet: 's' }]);
    await run('foxes');
    expect(await run('  FOXES ')).toMatch(/already ran/i);
    expect(search).toHaveBeenCalledOnce();
  });

  it('tells the agent to stop once the budget is spent', async () => {
    const { run, search } = await build(new Set());
    for (let i = 0; i < 6; i++) await run(`query ${i}`);
    search.mockClear();

    expect(await run('one more')).toMatch(/limit/i);
    expect(search).not.toHaveBeenCalled();
  });

  it('says nothing came back rather than returning an empty list', async () => {
    const { run } = await build(new Set(), []);
    expect(await run('foxes')).toMatch(/nothing came back/i);
  });

  it('does not spend budget on a repeat, so rephrasing is what costs', async () => {
    const searched = new Set<string>();
    const { run } = await build(searched, [{ title: 'A', url: 'https://a', snippet: 's' }]);
    await run('foxes');
    await run('foxes');
    expect(searched.size).toBe(1);
  });
});
