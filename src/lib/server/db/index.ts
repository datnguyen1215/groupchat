import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

/**
 * Tests point at a dedicated schema so a run never touches development data.
 * The tables are identical; only the `search_path` differs.
 */
const client = postgres(env.DATABASE_URL, {
	connection: { search_path: env.DATABASE_SCHEMA || 'public' }
});

export const db = drizzle(client, { schema });
export { schema };
