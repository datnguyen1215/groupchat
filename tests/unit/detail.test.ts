import { describe, expect, it } from 'vitest';
import { detailOf } from '../../src/lib/server/ai/detail';

/** The activity drawer's one-line summary of a tool call's input. */

describe('detailOf', () => {
  it.each([
    { input: null, label: 'null' },
    { input: undefined, label: 'undefined' },
    { input: 'a string', label: 'a bare string' },
    { input: 42, label: 'a number' }
  ])('returns nothing for $label', ({ input }) => {
    expect(detailOf(input)).toBe('');
  });

  it('returns nothing when no value is a string', () => {
    expect(detailOf({ count: 3, ok: true })).toBe('');
  });

  it('takes the first string value', () => {
    expect(detailOf({ query: 'retrieval eval', limit: 10 })).toBe('retrieval eval');
  });

  it('skips non-string values to find the first string', () => {
    expect(detailOf({ limit: 10, deep: true, query: 'found me' })).toBe('found me');
  });

  it('leaves a string at the 80-character limit intact', () => {
    const exact = 'x'.repeat(80);

    expect(detailOf({ q: exact })).toBe(exact);
  });

  it('truncates past the limit to 77 characters plus an ellipsis', () => {
    const long = 'x'.repeat(81);
    const result = detailOf({ q: long });

    /* The ellipsis is part of the budget, so the result is still 80 wide. */
    expect(result).toHaveLength(80);
    expect(result).toBe(`${'x'.repeat(77)}...`);
  });

  it('returns nothing for an empty object', () => {
    expect(detailOf({})).toBe('');
  });
});
