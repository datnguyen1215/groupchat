import { error, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import { logger, since } from '$lib/server/logger';
import { closeAllSessions, stopBrowserServer } from '$lib/server/browser';

const log = logger('http');

/**
 * One line per request, after the response is known, so method, path, status
 * and duration land together. This is the spine of a trace: everything a
 * request did is logged between its start and this line.
 */
const logRequests: Handle = async ({ event, resolve }) => {
  const start = Date.now();
  const { method } = event.request;
  const path = event.url.pathname;

  log.debug({ method, path }, 'request start');

  const response = await resolve(event);
  const ms = since(start);

  /** A 5xx is ours; a 4xx is the caller's. Neither is a silent success. */
  const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';
  log[level]({ method, path, status: response.status, ms }, 'request');

  return response;
};

/** Reachable signed out. Everything else needs a session. */
const PUBLIC_ROUTES = new Set(['/login', '/signup']);

const authenticate: Handle = async ({ event, resolve }) => {
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

/** Logging wraps auth so a redirect or a 401 is still one logged request. */
export const handle = sequence(logRequests, authenticate);

/** Uncaught server errors. SvelteKit already returned a 500 by the time this runs. */
export const handleError: HandleServerError = ({ error, event }) => {
  log.error(
    { path: event.url.pathname, method: event.request.method, err: error },
    'unhandled server error'
  );
  return { message: 'Internal error' };
};

/**
 * Shuts the browser down with the app.
 *
 * Chromium does not go away when its parent does, so without this a killed dev
 * server leaves a browser and an MCP process behind — and the next start finds
 * the port taken and the profile locked.
 *
 * Both signals, and `once` so a second Ctrl-C does not run it twice.
 */
const shutdown = async () => {
  await closeAllSessions().catch(() => {});
  await stopBrowserServer().catch(() => {});
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdown().finally(() => process.exit(0));
  });
}
