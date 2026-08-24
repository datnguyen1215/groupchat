/**
 * The connection string every entry point falls back to. Ports live in the
 * 10200+ range (see CLAUDE.md), and the defaults here match `docker-compose.yml`
 * so a clean checkout runs without an `.env` file at all.
 */
export const DEFAULT_DATABASE_URL = 'postgres://groupchat:groupchat@localhost:10201/groupchat';

export const databaseUrl = (url?: string) => url || DEFAULT_DATABASE_URL;
