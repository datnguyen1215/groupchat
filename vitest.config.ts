import { defineConfig } from 'vitest/config';

/** Unit tests only — pure functions, no database, no browser. */
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node'
	}
});
