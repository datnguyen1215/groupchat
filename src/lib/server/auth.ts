import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db, schema } from './db';

/** Shared with the signup form so the two can't disagree about what's valid. */
export const MIN_PASSWORD_LENGTH = 8;

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    /** No mail transport in this app, so an unverified address must still work. */
    requireEmailVerification: false
  },
  /** Lets the server-side sign-in/sign-up calls set their cookie on the response. */
  plugins: [sveltekitCookies(getRequestEvent)]
});
