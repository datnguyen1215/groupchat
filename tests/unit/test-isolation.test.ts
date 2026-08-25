import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Several agents run the e2e suite at once against one Postgres container and
 * one browser cookie jar. These are the two properties that keep those runs from
 * destroying each other's data — and the developer's session along with it.
 */

const config = readFileSync(resolve(process.cwd(), 'playwright.config.ts'), 'utf8');

describe('e2e run isolation', () => {
  it('serves the suite from a different host than the dev server', () => {
    /* Cookies ignore the port, so `localhost` would share a jar with :10200. */
    expect(config).toContain("process.env.TEST_HOST || '127.0.0.1'");
    expect(config).not.toContain('http://localhost:${PORT}');
  });

  it('gives each run its own schema rather than a shared name', () => {
    expect(config).toContain('process.env.DATABASE_SCHEMA || `test_${process.pid}`');
  });

  it('hands the generated schema to the dev server and the support helpers', () => {
    /* `tests/support/db.ts` reads the env var, not the config object. */
    expect(config).toContain('process.env.DATABASE_SCHEMA = SCHEMA');
    expect(config).toContain('DATABASE_SCHEMA: SCHEMA');
  });

  it('drops the run schema when the suite finishes', () => {
    expect(config).toContain('globalTeardown');
  });
});
