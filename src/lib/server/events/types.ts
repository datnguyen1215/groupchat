/**
 * What the client is told changed. Deliberately thin: a scope, never a payload.
 *
 * The client's answer to any of these is `invalidate`, which re-runs the load
 * functions that already know how to shape this data. Putting the row on the
 * wire would mean a second serialisation path to keep in step with
 * `serialize.ts`, and would still not survive a dropped connection — a client
 * that missed an event has to refetch anyway.
 */
export type LiveEvent =
  /** An entry, step, or presence change inside one thread. */
  | { scope: 'thread'; threadId: string }
  /** The thread list itself changed — created, renamed, or reordered. */
  | { scope: 'threads' };

/** The `invalidate` key a scope maps to, shared by publisher and subscriber. */
export const keyOf = (event: LiveEvent) =>
  event.scope === 'thread' ? `live:thread:${event.threadId}` : 'live:threads';
