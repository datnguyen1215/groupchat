import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

/**
 * Vite lets real environment variables beat `.env`, so a stale shell export
 * silently wins over the file. This stamps `.env` back on top.
 *
 * `loadEnv()` cannot do this: it returns `.env` merged *under* `process.env`,
 * so assigning its result back is a no-op.
 *
 * Only `vite.config.ts` calls this, which means dev, build and preview.
 * Production runs `build/index.js` under adapter-node and never loads it, and
 * `.env` is gitignored, so no file ships that could override injected secrets.
 */
export const overrideFromDotenv = (
  env: NodeJS.ProcessEnv = process.env,
  file = '.env'
): NodeJS.ProcessEnv => {
  try {
    return Object.assign(env, parse(readFileSync(file)));
  } catch (err) {
    // No .env is normal — production and fresh clones both run without one.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return env;
  }
};
