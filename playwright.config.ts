import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.TEST_PORT || 5180);

/**
 * API and UI tests run against a real dev server pointed at the `test` Postgres
 * schema, so a run cannot touch development data. Global setup rebuilds that
 * schema and seeds it once.
 */
export default defineConfig({
	testDir: './tests/e2e',
	globalSetup: './tests/support/global-setup.ts',
	fullyParallel: true,
	workers: process.env.CI ? 2 : undefined,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'line' : [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'api', testMatch: /api\/.*\.spec\.ts/ },
		{
			name: 'ui',
			testMatch: /ui\/.*\.spec\.ts/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
		}
	],
	webServer: {
		command: `vite dev --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: false,
		env: {
			DATABASE_SCHEMA: process.env.DATABASE_SCHEMA || 'test'
		}
	}
});
