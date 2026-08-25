import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/** Unit tests only — pure functions, no database, no browser. */
export default defineConfig({
  resolve: {
    /**
     * The route actions import through `$lib`, so the alias has to exist here
     * too. SvelteKit provides it at build time; Vitest runs without that.
     */
    alias: { $lib: resolve('./src/lib') }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
});
