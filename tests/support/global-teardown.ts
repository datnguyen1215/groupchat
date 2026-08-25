import { rmSync } from 'node:fs';
import { config } from 'dotenv';
import { STORAGE_STATE } from './auth';
import { dropSchema } from './db';

/**
 * Each run builds its own schema and cookie, so each run has to remove them.
 * Without this the database and working tree accumulate dead state for every
 * suite ever started.
 */
export default async () => {
  config({ path: '.env', quiet: true });
  await dropSchema();
  rmSync(STORAGE_STATE, { force: true });
};
