import { describe, expect, it } from 'vitest';

import { pickProvider } from '../../src/lib/server/research/providers';

describe('pickProvider', () => {
  it('returns nothing when no key is set', () => {
    expect(pickProvider({})).toBeUndefined();
    expect(pickProvider({ tavily: '', serpex: '' })).toBeUndefined();
  });

  it('picks serpex when only its key is set', () => {
    const picked = pickProvider({ serpex: 'k' });
    expect(picked?.provider.name).toBe('serpex');
    expect(picked?.key).toBe('k');
  });

  it('prefers tavily when both keys are set', () => {
    expect(pickProvider({ tavily: 't', serpex: 's' })?.provider.name).toBe('tavily');
  });
});

describe('serpex', () => {
  const serpex = pickProvider({ serpex: 'k' })!.provider;

  it('posts the query as `q`', () => {
    expect(serpex.body('foxes', 8)).toEqual({ q: 'foxes' });
  });

  it('reads hits out of `results` with `snippet`', () => {
    const hits = serpex.parse({
      results: [{ title: 'A', url: 'https://a', snippet: 'text' }]
    });
    expect(hits).toEqual([{ title: 'A', url: 'https://a', snippet: 'text' }]);
  });
});

describe('tavily', () => {
  const tavily = pickProvider({ tavily: 'k' })!.provider;

  it('asks for no LLM answer, only sources', () => {
    expect(tavily.body('foxes', 8)).toEqual({
      query: 'foxes',
      max_results: 8,
      include_answer: false
    });
  });

  it('reads hits out of `results` with `content`', () => {
    const hits = tavily.parse({ results: [{ title: 'A', url: 'https://a', content: 'text' }] });
    expect(hits[0].snippet).toBe('text');
  });

  it('truncates a long snippet', () => {
    const hits = tavily.parse({
      results: [{ title: 'A', url: 'https://a', content: 'x'.repeat(1000) }]
    });
    expect(hits[0].snippet).toHaveLength(300);
  });
});

describe('parsing anything else', () => {
  const serpex = pickProvider({ serpex: 'k' })!.provider;

  it('returns nothing when `results` is missing or not a list', () => {
    expect(serpex.parse({})).toEqual([]);
    expect(serpex.parse({ results: 'nope' })).toEqual([]);
  });

  it('drops a hit with no url, because a blank link goes nowhere', () => {
    expect(serpex.parse({ results: [{ title: 'A', snippet: 's' }] })).toEqual([]);
  });

  it('fills a missing title and snippet rather than passing undefined on', () => {
    expect(serpex.parse({ results: [{ url: 'https://a' }] })).toEqual([
      { title: '', url: 'https://a', snippet: '' }
    ]);
  });
});
