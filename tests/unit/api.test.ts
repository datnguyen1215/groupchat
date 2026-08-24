import { describe, expect, it } from 'vitest';
import { Fields, byteSize, relativeTime, slugify } from '../../src/lib/server/api';

/** `Fields.check()` throws a SvelteKit error; this reads the payload out of it. */
const problems = (run: () => void) => {
  try {
    run();
  } catch (e) {
    return (e as { body: App.Error }).body.invalid ?? [];
  }
  return null;
};

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Eval Harness')).toBe('eval-harness');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume');
  });

  it('collapses runs of punctuation and trims the edges', () => {
    expect(slugify('  ///Hello -- World!!  ')).toBe('hello-world');
  });

  it('falls back when nothing survives', () => {
    expect(slugify('!!!')).toBe('item');
  });

  it('caps length so an id stays usable', () => {
    expect(slugify('a'.repeat(200)).length).toBe(60);
  });
});

describe('byteSize', () => {
  it('reports bytes below a kilobyte', () => {
    expect(byteSize('hello')).toBe('5 B');
  });

  it('switches to kilobytes with one decimal', () => {
    expect(byteSize('x'.repeat(2048))).toBe('2.0 KB');
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(byteSize('é')).toBe('2 B');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-24T15:00:00Z');
  const at = (iso: string) => relativeTime(new Date(iso), now);

  it('says just now under a minute', () => {
    expect(at('2026-08-24T14:59:30Z')).toBe('just now');
  });

  it('counts minutes under an hour', () => {
    expect(at('2026-08-24T14:30:00Z')).toBe('30m ago');
  });

  it('names the weekday within the past week', () => {
    expect(at('2026-08-21T09:00:00Z')).toBe('Fri');
  });

  it('falls back to a date beyond a week', () => {
    expect(at('2026-07-01T09:00:00Z')).toBe('Jul 1');
  });

  it('never reports a future timestamp as negative', () => {
    expect(at('2026-08-24T16:00:00Z')).toBe('just now');
  });
});

describe('Fields', () => {
  it('collects every problem instead of failing on the first', () => {
    const f = new Fields({});
    f.string('name', { required: true });
    f.string('authorId', { required: true });
    expect(problems(() => f.check())).toEqual([
      { field: 'name', message: 'is required' },
      { field: 'authorId', message: 'is required' }
    ]);
  });

  it('passes cleanly when nothing is wrong', () => {
    const f = new Fields({ name: 'ok' });
    expect(f.string('name', { required: true })).toBe('ok');
    expect(problems(() => f.check())).toBeNull();
  });

  it('trims strings and rejects whitespace-only as empty', () => {
    const f = new Fields({ name: '  spaced  ', blank: '   ' });
    expect(f.string('name')).toBe('spaced');
    f.string('blank');
    expect(problems(() => f.check())).toEqual([{ field: 'blank', message: 'must not be empty' }]);
  });

  it('allows an explicitly empty string when asked', () => {
    const f = new Fields({ description: '' });
    expect(f.string('description', { allowEmpty: true })).toBe('');
    expect(problems(() => f.check())).toBeNull();
  });

  it('enforces max length', () => {
    const f = new Fields({ name: 'abcdef' });
    f.string('name', { max: 3 });
    expect(problems(() => f.check())?.[0].message).toBe('must be at most 3 characters');
  });

  it('rejects a value outside the enum and lists the options', () => {
    const f = new Fields({ kind: 'nope' });
    f.enum('kind', ['you', 'agent'] as const);
    expect(problems(() => f.check())?.[0].message).toBe('must be one of: you, agent');
  });

  it('rejects non-integers and out-of-range integers', () => {
    const f = new Fields({ a: 1.5, b: -1 });
    f.int('a');
    f.int('b', { min: 0 });
    expect(problems(() => f.check())).toEqual([
      { field: 'a', message: 'must be an integer' },
      { field: 'b', message: 'must be at least 0' }
    ]);
  });

  it('dedupes and trims string arrays', () => {
    const f = new Fields({ skills: [' a ', 'a', 'b', ''] });
    expect(f.stringArray('skills')).toEqual(['a', 'b']);
  });

  it('rejects an array holding a non-string', () => {
    const f = new Fields({ skills: ['a', 3] });
    f.stringArray('skills');
    expect(problems(() => f.check())?.[0].message).toBe('must be an array of strings');
  });

  it('distinguishes an absent field from an explicit null', () => {
    const f = new Fields({ present: null });
    expect(f.has('present')).toBe(true);
    expect(f.has('absent')).toBe(false);
  });
});
