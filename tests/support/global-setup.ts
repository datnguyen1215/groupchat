import { config } from 'dotenv';
import { connect, resetSchema } from './db';
import { seedBase } from './fixtures';

/**
 * Rebuilds the test schema from the migrations and seeds the baseline, once per
 * run and before the dev server starts serving.
 */
export default async () => {
  // `.env` is optional — every reader falls back to the compose defaults.
  config({ path: '.env', quiet: true });

  await resetSchema();

  const sql = connect();
  try {
    await seedBase(sql);
  } finally {
    await sql.end();
  }
};
