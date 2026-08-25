/**
 * The agents' reach outside the thread: search the web.
 *
 * Defined here rather than in `ai/tools.ts` so that file gains one spread
 * instead of a block, and so the HTTP, the provider choice and the tool
 * description live next to each other.
 */

import { tool } from 'ai';
import { z } from 'zod';

import { search, searchProvider } from './search';

export { search, searchProvider, type SearchHit } from './search';

/** The provider's name for the boot log, or `undefined`. Nothing branches on it. */
export const searchProviderName = () => searchProvider()?.provider.name;

/**
 * The description is the spec: it is what decides whether an agent looks
 * something up or guesses at it.
 */
export const researchTools = {
  web_search: tool({
    description:
      'Search the open web. Use it when the answer is not in this thread, not in a ' +
      'skill or document, and not something you already know — anything about the ' +
      'world outside this app, or anything that may have changed since you were ' +
      'trained. Returns titles, links and snippets. A snippet is not a source: cite ' +
      'the link when you use what it says.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('What to search for, as you would type it into a search box.')
    }),
    execute: async ({ query }: { query: string }) => {
      const hits = await search(query);

      /** Told plainly rather than returned as an empty array, which reads as a
       * failure the model tries to fix by searching again in different words. */
      if (hits.length === 0) {
        return 'Nothing came back for that. Say so plainly, or try one differently-worded search — not several.';
      }

      return hits;
    }
  })
};
