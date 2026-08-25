import { config } from 'dotenv';
import { dropSchema } from './db';

/**
 * Each run builds its own schema, so each run has to remove it. Without this the
 * database accumulates a dead `test_<pid>` schema for every suite ever started.
 */
export default async () => {
  config({ path: '.env', quiet: true });
  await dropSchema();
};
