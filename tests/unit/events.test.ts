import { describe, expect, it, vi } from 'vitest';
import { publish, subscribe } from '../../src/lib/server/events/bus';
import { keyOf } from '../../src/lib/server/events/types';

describe('keyOf', () => {
  it('scopes a thread event to that thread', () => {
    expect(keyOf({ scope: 'thread', threadId: 'abc' })).toBe('live:thread:abc');
  });

  it('gives every thread-list event the same key', () => {
    expect(keyOf({ scope: 'threads' })).toBe('live:threads');
  });
});

describe('bus', () => {
  it('delivers to every subscriber', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe(a);
    const offB = subscribe(b);

    publish({ scope: 'threads' });

    expect(a).toHaveBeenCalledWith({ scope: 'threads' });
    expect(b).toHaveBeenCalledWith({ scope: 'threads' });
    offA();
    offB();
  });

  it('stops delivering once unsubscribed', () => {
    const listener = vi.fn();
    subscribe(listener)();

    publish({ scope: 'threads' });

    expect(listener).not.toHaveBeenCalled();
  });

  /** A live update is never worth failing the write that triggered it. */
  it('keeps delivering after a subscriber throws', () => {
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {});
    const healthy = vi.fn();
    const offBad = subscribe(() => {
      throw new Error('boom');
    });
    const offGood = subscribe(healthy);

    expect(() => publish({ scope: 'threads' })).not.toThrow();
    expect(healthy).toHaveBeenCalled();

    offBad();
    offGood();
    console_.mockRestore();
  });
});
