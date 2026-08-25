import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `search.ts` reads its keys from `$env/dynamic/private`, which Vitest does not
 * provide. Each test mocks it to the keys it wants and re-imports, so the module
 * picks the provider fresh.
 */
const load = async (env: Record<string, string>) => {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env }));

  return import('../../src/lib/server/research/search');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('$env/dynamic/private');
});

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe('search', () => {
  it('throws a recoverable message when no key is set', async () => {
    const { search } = await load({});
    await expect(search('foxes')).rejects.toThrow(/not configured/i);
  });

  it('sends the key as a bearer token to the chosen provider', async () => {
    const fetchMock = ok({ results: [] });
    vi.stubGlobal('fetch', fetchMock);

    const { search } = await load({ SERPEX_API_KEY: 'k' });
    await search('foxes');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.serpex.dev/api/search');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string)).toEqual({ q: 'foxes' });
  });

  it('returns the provider hits', async () => {
    vi.stubGlobal(
      'fetch',
      ok({ results: [{ title: 'A', url: 'https://a', snippet: 's' }] })
    );

    const { search } = await load({ SERPEX_API_KEY: 'k' });
    expect(await search('foxes')).toEqual([{ title: 'A', url: 'https://a', snippet: 's' }]);
  });

  it('caps the hits, because a provider without a limit sends its whole page', async () => {
    const results = Array.from({ length: 25 }, (_, i) => ({
      title: `T${i}`,
      url: `https://a/${i}`,
      snippet: 's'
    }));
    vi.stubGlobal('fetch', ok({ results }));

    const { search } = await load({ SERPEX_API_KEY: 'k' });
    expect(await search('foxes')).toHaveLength(8);
  });

  it('throws with the status when the provider rejects the call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })));

    const { search } = await load({ SERPEX_API_KEY: 'k' });
    await expect(search('foxes')).rejects.toThrow(/401/);
  });

  it('rethrows a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const { search } = await load({ SERPEX_API_KEY: 'k' });
    await expect(search('foxes')).rejects.toThrow(/ECONNREFUSED/);
  });

  it('reports which provider would answer', async () => {
    const { searchProvider } = await load({ SERPEX_API_KEY: 'k' });
    expect(searchProvider()?.provider.name).toBe('serpex');
  });
});
