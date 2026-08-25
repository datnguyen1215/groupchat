/**
 * Web search.
 *
 * Knows nothing about threads, agents or documents: a query in, hits out. The
 * tool wrapper in `index.ts` is what makes it available to an agent.
 *
 * Which service answers is decided by whichever key is set — see
 * `providers.ts`. Nothing here is provider-specific; this file is the HTTP, the
 * cap and the logging.
 */

import { env } from '$env/dynamic/private';
import { logger, since } from '../logger';
import { pickProvider, type ProviderHit } from './providers';

const log = logger('search');

/** A search hit as the agent reads it. */
export type SearchHit = ProviderHit;

/**
 * How many hits reach the model.
 *
 * A whole page of them crowds out the thread, which is what the turn is about.
 * The first several are where the answer is; past that the agent is reading
 * noise it pays for by the token.
 */
const MAX_HITS = 8;

/** Which provider a search would use right now, or `undefined` when no key is set. */
export const searchProvider = () =>
  pickProvider({ tavily: env.TAVILY_API_KEY, serpex: env.SERPEX_API_KEY });

/**
 * Search the web.
 *
 * @throws {Error} When no provider key is set, or the provider fails. Both reach
 * the model as a tool error it can recover from — a search it cannot run is
 * something to say plainly, not to retry.
 */
export const search = async (query: string): Promise<SearchHit[]> => {
  const selected = searchProvider();

  if (!selected) {
    log.warn({ query }, 'unconfigured');
    throw new Error(
      'Web search is not configured (no search API key). Say so plainly rather than trying again — the key is not something you can set.'
    );
  }

  const { provider, key } = selected;
  const start = Date.now();

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(provider.body(query, MAX_HITS))
  }).catch(cause => {
    /** A transport failure has no status, so it would otherwise leave no trace. */
    log.error({ provider: provider.name, query, err: cause }, 'failed to send');
    throw cause;
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    log.error(
      { provider: provider.name, query, status: response.status, body: body.slice(0, 500) },
      'failed'
    );
    throw new Error(`Search failed: ${response.status} ${body.slice(0, 200)}`);
  }

  /** Capped here rather than trusting the provider — Serpex has no limit
   * parameter, so its page arrives whole. */
  const hits = provider.parse(await response.json()).slice(0, MAX_HITS);

  log.info(
    { provider: provider.name, query, hits: hits.length, ms: since(start) },
    'searched'
  );

  return hits;
};
