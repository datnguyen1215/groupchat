/**
 * The search providers, behind one shape.
 *
 * Switching provider is pasting a different key into `.env`. Nothing else knows
 * which one answered — `search.ts` does the HTTP, and the tool above it sees
 * `SearchHit[]` either way.
 *
 * Both are POST-with-a-bearer-token returning a list of {title, url, text}, so
 * the only things that differ are the url, the body and the snippet field name.
 * That is what a provider is here: three details. No registry, no subclassing.
 */

/** One result, as the provider returned it. */
export type ProviderHit = {
  title: string;
  url: string;
  snippet: string;
};

export type Provider = {
  /** Logged with every search, so the log says which service answered. */
  name: string;
  url: string;
  body: (query: string, limit: number) => unknown;
  /** Pull the hits out of whatever the provider wraps them in. */
  parse: (payload: unknown) => ProviderHit[];
};

/**
 * How much of a snippet is kept.
 *
 * Tavily's `content` runs to a thousand-odd characters per hit — a page of prose
 * for eight hits, which buries the thread the agent is working in. A snippet is
 * there to say whether the page is worth opening, not to be the answer.
 */
const SNIPPET_MAX = 300;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A hit with no url is dropped rather than kept blank — a blank link is noise. */
const toHits = (rows: unknown, snippetKey: 'content' | 'snippet'): ProviderHit[] => {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .filter(row => text(row.url))
    .map(row => ({
      title: text(row.title),
      url: text(row.url),
      snippet: text(row[snippetKey]).slice(0, SNIPPET_MAX)
    }));
};

/**
 * Tavily. Bearer auth in the header, hits under `results`, snippet is `content`
 * — a long one, hence the cap above.
 *
 * `include_answer: false` because an LLM-written summary is the one thing this
 * must not hand back: the agent would repeat a paraphrase with no author.
 */
const tavily: Provider = {
  name: 'tavily',
  url: 'https://api.tavily.com/search',
  body: (query, limit) => ({ query, max_results: limit, include_answer: false }),
  parse: payload => toHits((payload as { results?: unknown }).results, 'content')
};

/** Serpex. Hits under `results`, snippet is `snippet`. */
const serpex: Provider = {
  name: 'serpex',
  url: 'https://api.serpex.dev/api/search',
  body: query => ({ q: query }),
  parse: payload => toHits((payload as { results?: unknown }).results, 'snippet')
};

/**
 * Whichever key is set decides. No `SEARCH_PROVIDER` variable to keep in sync
 * with the key — a wrong pairing is two settings disagreeing, and it only shows
 * up on the first search.
 *
 * Tavily first when both are set, and the choice is logged, so "which one
 * answered" is never a guess.
 */
export const pickProvider = (keys: {
  tavily?: string;
  serpex?: string;
}): { provider: Provider; key: string } | undefined => {
  if (keys.tavily) return { provider: tavily, key: keys.tavily };
  if (keys.serpex) return { provider: serpex, key: keys.serpex };

  return undefined;
};
