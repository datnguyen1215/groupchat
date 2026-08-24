import { error, redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';

/** Reachable signed out. Everything else needs a session. */
const PUBLIC_ROUTES = new Set(['/login', '/signup']);

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.user = session?.user ?? null;
  event.locals.session = session?.session ?? null;

  const { pathname } = event.url;

  /* better-auth's own endpoints are how you get a session in the first place. */
  if (!pathname.startsWith('/api/auth')) {
    if (!event.locals.user) {
      /**
       * A fetch expects a status it can branch on, not a login page. Only
       * navigations get the redirect.
       */
      if (pathname.startsWith('/api/')) error(401, 'Not signed in');
      if (!PUBLIC_ROUTES.has(pathname)) {
        /* Carry the destination so sign-in lands where they were headed. */
        redirect(303, `/login?next=${encodeURIComponent(pathname + event.url.search)}`);
      }
    } else if (PUBLIC_ROUTES.has(pathname)) {
      redirect(303, '/');
    }
  }

  return svelteKitHandler({ auth, event, resolve, building });
};
