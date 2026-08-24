import type { Handle, HandleServerError } from '@sveltejs/kit';
import { logger, since } from '$lib/server/logger';

const log = logger('http');

/**
 * One line per request, after the response is known, so method, path, status
 * and duration land together. This is the spine of a trace: everything a
 * request did is logged between its start and this line.
 */
export const handle: Handle = async ({ event, resolve }) => {
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

/** Uncaught server errors. SvelteKit already returned a 500 by the time this runs. */
export const handleError: HandleServerError = ({ error, event }) => {
  log.error(
    { path: event.url.pathname, method: event.request.method, err: error },
    'unhandled server error'
  );
  return { message: 'Internal error' };
};
