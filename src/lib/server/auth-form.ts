/**
 * The pure decisions the login and signup actions make, kept out of the actions
 * themselves so they can be tested without a request.
 */

/**
 * Only ever an internal path. A `next` of `https://evil.example` or `//evil`
 * would otherwise turn the login form into an open redirect.
 */
export const safeNext = (next: FormDataEntryValue | null) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';

/** No name field on the form, so the address supplies one. */
export const nameFromEmail = (email: string) => email.split('@')[0] || email;
