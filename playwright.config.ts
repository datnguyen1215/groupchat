import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './tests/support/auth';

const PORT = Number(process.env.TEST_PORT || 10302);

/**
 * API and UI tests run against a real dev server pointed at the `test` Postgres
 * schema, so a run cannot touch development data. Global setup rebuilds that
 * schema and seeds it once.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/support/global-setup.ts',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
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
    command: `vite dev --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    env: {
      DATABASE_SCHEMA: process.env.DATABASE_SCHEMA || 'test',
      /* Sessions must survive the run; a missing secret makes better-auth throw. */
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET || 'kJ8pQx2vN7mR4tY6wZ1aB5cD9eF3gH0iL2nO4pS6uV8='
    }
  }
});
