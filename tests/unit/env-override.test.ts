import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideFromDotenv } from '$lib/server/env-override';

const withDotenv = (contents: string) => {
  const file = join(mkdtempSync(join(tmpdir(), 'groupchat-env-')), '.env');
  writeFileSync(file, contents);
  return file;
};

describe('overrideFromDotenv', () => {
  it('lets .env win over an existing shell variable', () => {
    const file = withDotenv('DEEPSEEK_API_KEY=sk-from-dotenv\n');
    const env = { DEEPSEEK_API_KEY: 'sk-stale-shell' };

    expect(overrideFromDotenv(env, file).DEEPSEEK_API_KEY).toBe('sk-from-dotenv');
  });

  it('sets variables absent from the shell', () => {
    const file = withDotenv('DATABASE_URL=postgres://localhost:10201/groupchat\n');

    expect(overrideFromDotenv({}, file).DATABASE_URL).toBe(
      'postgres://localhost:10201/groupchat'
    );
  });

  it('leaves shell variables untouched when .env is missing', () => {
    const env = { DEEPSEEK_API_KEY: 'sk-injected-by-host' };

    // The production path: adapter-node with no .env on disk.
    expect(overrideFromDotenv(env, '/nonexistent/.env')).toEqual({
      DEEPSEEK_API_KEY: 'sk-injected-by-host'
    });
  });

  it('rethrows errors that are not a missing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'groupchat-env-'));

    // A directory, not a file — EISDIR must not be swallowed as "no .env".
    expect(() => overrideFromDotenv({}, dir)).toThrow();
  });
});
