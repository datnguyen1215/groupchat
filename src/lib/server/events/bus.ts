import type { LiveEvent } from './types';

/**
 * The swappable half of the live layer. Everything upstream calls `publish`,
 * everything downstream calls `subscribe`, and neither knows this is an
 * in-process fan-out.
 *
 * In-memory on purpose, and staying that way: this app is one `adapter-node`
 * process, so a publish and its subscribers are always in the same heap. A
 * second process would not see these events — if that ever changes, these two
 * functions are the only thing to reimplement and no caller moves.
 */
type Listener = (event: LiveEvent) => void;

const listeners = new Set<Listener>();

/** Announces a change. Never throws: a broken subscriber must not fail a write. */
export const publish = (event: LiveEvent) => {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('[live bus]', error);
    }
  }
};

/** Registers a listener. The returned function removes it — always call it. */
export const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
