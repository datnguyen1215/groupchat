import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';
import { databaseUrl } from './url';

/**
 * Tests point at a dedicated schema so a run never touches development data.
 * The tables are identical; only the `search_path` differs.
 */
const client = postgres(databaseUrl(env.DATABASE_URL), {
	connection: { search_path: env.DATABASE_SCHEMA || 'public' }
});

export const db = drizzle(client, { schema });
export { schema };
