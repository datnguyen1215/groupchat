/**
 * One account every test signs in as. The suite is about the app's behaviour for
 * a signed-in user; the auth specs create their own accounts for the flows that
 * are actually about signing up.
 */
export const TEST_USER = {
  email: 'tester@example.com',
  password: 'test-password-123'
};

/** Where global setup writes the signed-in cookie for every project to reuse. */
export const STORAGE_STATE = 'tests/.auth/state.json';
