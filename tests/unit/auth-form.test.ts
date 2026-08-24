import { describe, expect, it } from 'vitest';
import { nameFromEmail, safeNext } from '../../src/lib/server/auth-form';

describe('safeNext', () => {
  it('keeps an internal path', () => {
    expect(safeNext('/chats/abc')).toBe('/chats/abc');
    expect(safeNext('/agents?filter=mine')).toBe('/agents?filter=mine');
  });

  it('falls back to the root when there is nothing usable', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
    /* A File, which a multipart form could supply. */
    expect(safeNext(new File([], 'x'))).toBe('/');
  });

  it.each([
    ['https://evil.example/steal', 'an absolute URL'],
    ['//evil.example/steal', 'a protocol-relative URL'],
    ['javascript:alert(1)', 'a script URL'],
    ['chats/abc', 'a relative path with no leading slash']
  ])('refuses %s (%s)', target => {
    expect(safeNext(target)).toBe('/');
  });
});

describe('nameFromEmail', () => {
  it('takes the local part', () => {
    expect(nameFromEmail('dat@example.com')).toBe('dat');
    expect(nameFromEmail('first.last@sub.example.com')).toBe('first.last');
  });

  it('falls back to the whole string when there is no local part', () => {
    expect(nameFromEmail('@example.com')).toBe('@example.com');
    expect(nameFromEmail('nodomain')).toBe('nodomain');
  });
});
