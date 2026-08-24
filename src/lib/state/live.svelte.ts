import { invalidate } from '$app/navigation';
import { browser } from '$app/environment';
import { logger } from '$lib/logger.svelte';

const log = logger('live');

/**
 * The client half of the live layer, and the only place that knows the
 * transport is SSE. Components never see an `EventSource`; load functions
 * declare a `depends('live:...')` key and this turns a server event into the
 * matching `invalidate`.
 *
 * Thin by design: the event names a scope, never carries a row. The load
 * function that already shapes that data re-runs, so there is one code path for
 * first paint and for every update, and a client that missed events while
 * disconnected recovers by refetching rather than by replaying.
 */
class Live {
  /** Null until `connect` runs, and while a dropped connection is retrying. */
  #source: EventSource | null = null;

  /** Distinguishes the first open from a recovery; see `onopen`. */
  #everOpen = false;

  /** True while the stream is open. Read it to show a connection indicator. */
  connected = $state(false);

  /**
   * Opens the stream. Call once, from the root layout. Returns a teardown for
   * `$effect`; a second call while connected is a no-op.
   */
  connect() {
    if (!browser || this.#source) return () => {};

    log.info('connecting');
    const source = new EventSource('/api/events');
    this.#source = source;

    source.onopen = () => {
      /**
       * Only on a *re*connect. Events fired while the socket was down are gone,
       * and a thin event carries nothing to replay, so refetching everything is
       * the whole recovery story — but the first open follows SSR data that is
       * already current, and refetching it would be a wasted round trip.
       */
      const reopened = this.#everOpen;
      this.#everOpen = true;
      this.connected = true;
      log.info({ reopened }, reopened ? 'reconnected — refetching everything' : 'connected');
      if (reopened) void invalidate(() => true);
    };

    /** The payload is the invalidate key itself — see `events/types.ts`. */
    source.onmessage = event => {
      /** Debug: one line per event per tab, the busiest thing on the client. */
      log.debug({ key: event.data }, 'event');
      void invalidate(event.data);
    };

    /** EventSource retries on its own; this only reflects the gap in the UI. */
    source.onerror = () => {
      /** Warn, not error: EventSource retries, so the stream usually comes back. */
      if (this.connected) log.warn('stream dropped — EventSource will retry');
      this.connected = false;
    };

    return () => {
      log.info('disconnecting');
      source.close();
      this.#source = null;
      this.#everOpen = false;
      this.connected = false;
    };
  }
}

export const live = new Live();
