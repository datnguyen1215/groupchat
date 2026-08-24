import { describe, expect, it, vi } from 'vitest';

/**
 * `tools.ts` reaches the database and `$env/dynamic/private` through its
 * imports. Stubbing them leaves the pure helper — how a search hit is
 * turned into a skimmable excerpt.
 */
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

const { excerpt } = await import('../../src/lib/server/ai/tools');

describe('excerpt', () => {
  it('returns empty when the needle is absent', () => {
    expect(excerpt('nothing here', 'fox')).toBe('');
  });

  it('returns the body as-is when it is short and matches', () => {
    expect(excerpt('a brown fox', 'brown fox')).toBe('a brown fox');
  });

  it('collapses whitespace so the excerpt stays on one line', () => {
    expect(excerpt('a\n\n  brown   fox', 'brown')).toBe('a brown fox');
  });

  it('elides the head when the match is deep in the body', () => {
    const body = `${'x'.repeat(200)} brown fox`;
    const out = excerpt(body, 'brown fox');
    expect(out.startsWith('...')).toBe(true);
    expect(out).toContain('brown fox');
  });

  it('elides the tail when the body runs past the window', () => {
    const out = excerpt(`brown fox ${'y'.repeat(400)}`, 'brown fox');
    expect(out.endsWith('...')).toBe(true);
  });

  it('matches case-insensitively via a lowercased needle', () => {
    expect(excerpt('A Brown Fox', 'brown fox')).toContain('Brown Fox');
  });
});
