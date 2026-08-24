import type { HandleClientError } from '@sveltejs/kit';
import { logger } from '$lib/logger.svelte';

const log = logger('client');

/** Every uncaught client-side error, including failed load functions. */
export const handleError: HandleClientError = ({ error, event }) => {
  log.error({ path: event.url.pathname, error }, 'unhandled client error');
  return { message: 'Something went wrong' };
};
