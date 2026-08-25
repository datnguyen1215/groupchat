import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { databaseUrl } from '../../src/lib/server/db/url';

/**
 * Test data lives in its own Postgres schema, never `public`. Tests can then run
 * against the same container as development without colliding with it.
 */
export const TEST_SCHEMA = process.env.DATABASE_SCHEMA || 'test';

export const connect = (schema = TEST_SCHEMA) =>
  postgres(databaseUrl(process.env.DATABASE_URL), { connection: { search_path: schema }, max: 4 });

const migrationsDir = resolve(process.cwd(), 'drizzle');

/**
 * Drops and rebuilds the schema from the generated migrations. The migrations
 * are schema-qualified only by `search_path`, so the same SQL builds any schema.
 */
export const resetSchema = async (schema = TEST_SCHEMA) => {
  const root = postgres(databaseUrl(process.env.DATABASE_URL), { max: 1 });
  try {
    await root.unsafe(`drop schema if exists "${schema}" cascade`);
    await root.unsafe(`create schema "${schema}"`);
    await root.unsafe(`set search_path to "${schema}"`);

    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      /**
       * Drizzle hardcodes `"public"."enum_name"` on CREATE TYPE, which
       * `search_path` cannot redirect — the qualifier has to be rewritten so the
       * enums land in the target schema alongside their tables.
       */
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8').replaceAll(
        '"public".',
        `"${schema}".`
      );

      /** Drizzle delimits statements with this marker rather than a bare `;`. */
      for (const statement of sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim();
        if (trimmed) await root.unsafe(`set search_path to "${schema}"; ${trimmed}`);
      }
    }
  } finally {
    await root.end();
  }
};

/** Removes a run's schema once its suite is over. */
export const dropSchema = async (schema = TEST_SCHEMA) => {
  /* The cascade reports one NOTICE per dropped table; none of it is actionable. */
  const root = postgres(databaseUrl(process.env.DATABASE_URL), { max: 1, onnotice: () => {} });
  try {
    await root.unsafe(`drop schema if exists "${schema}" cascade`);
  } finally {
    await root.end();
  }
};
