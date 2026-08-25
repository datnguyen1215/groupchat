import { SCHEMA } from './run';

/**
 * One account every test signs in as. The suite is about the app's behaviour for
 * a signed-in user; the auth specs create their own accounts for the flows that
 * are actually about signing up.
 */
export const TEST_USER = {
  email: 'tester@example.com',
  password: 'test-password-123'
};

/**
 * Where setup writes the signed-in cookie for every project to reuse. Keyed on
 * the run's schema: concurrent runs each hold a session for their own schema, and
 * a shared path would let one run's cookie point another at a schema being torn
 * down. `DATABASE_SCHEMA` is set by `playwright.config.ts` and forwarded to workers.
 */
export const STORAGE_STATE = `tests/.auth/${SCHEMA}.json`;
