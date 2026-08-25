import { describe, expect, it, vi } from 'vitest';

/** `repo.ts` reaches the database through its imports; the id helper is pure. */
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

const { documentId } = await import('../../src/lib/server/repo');

describe('documentId', () => {
  it('does not derive the id from any name, so a rename cannot change it', () => {
    /* Takes no argument at all — the shape is the guarantee. */
    expect(documentId.length).toBe(0);
  });

  it('is unique per call, so a re-used name never collides onto one row', () => {
    const ids = new Set(Array.from({ length: 500 }, () => documentId()));
    expect(ids.size).toBe(500);
  });

  it('is a UUID, matching the ids threads already use', () => {
    expect(documentId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
