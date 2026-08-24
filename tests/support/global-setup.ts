import { config } from 'dotenv';
import { connect, resetSchema } from './db';
import { seedBase } from './fixtures';

/**
 * Rebuilds the test schema from the migrations and seeds the baseline, once per
 * run and before the dev server starts serving.
 */
export default async () => {
	config({ path: '.env', quiet: true });
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set — copy .env.example');

	await resetSchema();

	const sql = connect();
	try {
		await seedBase(sql);
	} finally {
		await sql.end();
	}
};
