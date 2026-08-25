import { defineConfig, devices } from '@playwright/test';
import { SCHEMA } from './tests/support/run';
import { STORAGE_STATE } from './tests/support/auth';

const PORT = Number(process.env.TEST_PORT || 10302);

/**
 * Cookies are keyed by host and ignore the port, so a suite served from
 * `localhost` writes its session token into the same jar as the dev server on
 * :10200 — signing the developer out, since that token points at a schema their
 * server cannot see. `127.0.0.1` is a separate origin with a separate jar.
 */
const HOST = process.env.TEST_HOST || '127.0.0.1';

/**
 * API and UI tests run against a real dev server pointed at a per-run Postgres
 * schema, so a run cannot touch development data. Global setup rebuilds that
 * schema and seeds it once.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Traces and error context, like the cookie, cannot share a path across runs. */
  outputDir: `test-results/${SCHEMA}`,
  globalSetup: './tests/support/global-setup.ts',
  globalTeardown: './tests/support/global-teardown.ts',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'retain-on-failure'
  },
  projects: [
    /* Signs the shared account in once; every other project reuses its cookie. */
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'api',
      testMatch: /e2e\/api\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: STORAGE_STATE }
    },
    {
      name: 'ui',
      testMatch: /e2e\/ui\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE_STATE
      }
    },
    /**
     * The auth flows themselves must start signed out, so this project opts out
     * of the shared cookie instead of inheriting it.
     */
    {
      name: 'auth',
      testMatch: /e2e\/auth\/.*\.spec\.ts/,
      /* Depends on setup for the shared account, but deliberately not its cookie. */
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    }
  ],
  webServer: {
    command: `vite dev --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: false,
    env: {
      DATABASE_SCHEMA: SCHEMA,
      /* Sessions must survive the run; a missing secret makes better-auth throw. */
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET || 'kJ8pQx2vN7mR4tY6wZ1aB5cD9eF3gH0iL2nO4pS6uV8='
    }
  }
});
