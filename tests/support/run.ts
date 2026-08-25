/**
 * Resolves the identity of a single e2e run: the Postgres schema, and by
 * extension the cookie file and output dir keyed on it.
 *
 * This lives apart from the config so that importing it is what sets the env
 * var. `playwright.config.ts` imports `tests/support/auth.ts` for the cookie
 * path, and an import runs before the config body — so setting the var there
 * would come too late. Workers re-import the config and inherit the parent's
 * env, where the var is already set, so they resolve the same value.
 */
export const SCHEMA = (process.env.DATABASE_SCHEMA ||= `test_${process.pid}`);
