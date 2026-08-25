import { describe, expect, it } from 'vitest';
import { getAuthTables } from 'better-auth/db';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { account, session, user, verification } from '../../src/lib/server/db/schema';

/**
 * better-auth dictates these table shapes, and the drizzle adapter queries the
 * columns it expects rather than the ones we declared. A version bump that adds
 * a field would otherwise fail at runtime, on a query, in production — this
 * catches it at `npm run test:unit` instead.
 */

const tables = { user, session, account, verification };

/** better-auth names fields in camelCase; the columns are snake_case. */
const toColumn = (field: string) => field.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);

const expected = getAuthTables({ emailAndPassword: { enabled: true } });

describe('auth schema matches what better-auth expects', () => {
  it.each(Object.keys(tables))('%s declares every field better-auth will query', name => {
    const declared = new Set(
      getTableConfig(tables[name as keyof typeof tables]).columns.map(c => c.name)
    );

    const required = Object.keys(expected[name].fields).map(toColumn);

    /* `id` is implicit in better-auth's model and explicit in ours. */
    expect(declared).toContain('id');
    for (const column of required) expect(declared).toContain(column);
  });

  it('covers every table better-auth asks for', () => {
    /* A new plugin bringing its own table should fail here, not at query time. */
    expect(Object.keys(expected).sort()).toEqual(Object.keys(tables).sort());
  });

  it('stores the password hash on account, not on user', () => {
    const userColumns = getTableConfig(user).columns.map(c => c.name);
    const accountColumns = getTableConfig(account).columns.map(c => c.name);

    expect(accountColumns).toContain('password');
    expect(userColumns).not.toContain('password');
  });

  it('keeps the session token unique, since it is the lookup key', () => {
    const token = getTableConfig(session).columns.find(c => c.name === 'token');

    expect(token?.isUnique).toBe(true);
  });

  it('keeps the email unique, since it identifies the account', () => {
    const email = getTableConfig(user).columns.find(c => c.name === 'email');

    expect(email?.isUnique).toBe(true);
  });
});
