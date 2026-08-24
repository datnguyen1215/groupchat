import { defineConfig } from 'drizzle-kit';
import { databaseUrl } from './src/lib/server/db/url';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: databaseUrl(process.env.DATABASE_URL) }
});
