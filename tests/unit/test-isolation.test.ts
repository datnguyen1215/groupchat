import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Several agents run the e2e suite at once against one Postgres container, one
 * cookie jar and one working tree. Every resource a run touches has to be keyed
 * on that run, or a finishing run tears down state a live one is still using.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const config = read('playwright.config.ts');
const run = read('tests/support/run.ts');
const auth = read('tests/support/auth.ts');
const db = read('tests/support/db.ts');

describe('e2e run isolation', () => {
  it('serves the suite from a different host than the dev server', () => {
    /* Cookies ignore the port, so `localhost` would share a jar with :10200. */
    expect(config).toContain("process.env.TEST_HOST || '127.0.0.1'");
    expect(config).not.toContain('http://localhost:${PORT}');
  });

  it('derives one schema per run and publishes it through the environment', () => {
    expect(run).toContain('process.env.DATABASE_SCHEMA ||= `test_${process.pid}`');
    expect(config).toContain('DATABASE_SCHEMA: SCHEMA');
  });

  it('resolves the run identity from a module the config imports first', () => {
    /* An import runs before the config body, so the var must be set in one. */
    const runImport = config.indexOf("from './tests/support/run'");
    const authImport = config.indexOf("from './tests/support/auth'");
    expect(runImport).toBeGreaterThan(-1);
    expect(runImport).toBeLessThan(authImport);
    expect(config).not.toContain('const SCHEMA =');
  });

  it('keys the cookie file and output dir on the run, not a fixed path', () => {
    /* A shared cookie points one run at another run's schema. */
    expect(auth).toContain('tests/.auth/${SCHEMA}.json');
    /* Where the artifacts live is free to move; that they are per-run is not. */
    expect(config).toMatch(/outputDir:.*SCHEMA/);
  });

  it('has every helper read the one resolved schema', () => {
    expect(db).toContain('export const TEST_SCHEMA = SCHEMA');
  });

  it('removes the run schema and its cookie when the suite finishes', () => {
    expect(config).toContain('globalTeardown');
    const teardown = read('tests/support/global-teardown.ts');
    expect(teardown).toContain('dropSchema()');
    expect(teardown).toContain('rmSync(STORAGE_STATE');
  });
});
