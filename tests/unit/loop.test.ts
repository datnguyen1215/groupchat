import { describe, expect, it, vi } from 'vitest';

/**
 * `loop.ts` reaches the database and `$env/dynamic/private` through its imports,
 * neither of which belongs in a unit test. Stubbing them leaves the pure
 * helpers — how a turn becomes a sparkline, and what the drawer shows.
 */
vi.mock('$env/dynamic/private', () => ({ env: { DEEPSEEK_API_KEY: 'test' } }));
vi.mock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

const {
  SPEECH,
  barsFor,
  detailOf,
  describe: errorLine
} = await import('../../src/lib/server/ai/loop');

const call = (toolName: string) => ({ toolName });

describe('barsFor', () => {
  it('draws one bar per working tool call', () => {
    const steps = [{ toolCalls: [call('list_skills'), call('read_skill')] }];
    expect(barsFor(steps)).toEqual(['ok', 'ok']);
  });

  it('marks a delegation as a spawn', () => {
    const steps = [{ toolCalls: [call('list_agents'), call('run_agent')] }];
    expect(barsFor(steps)).toEqual(['ok', 'spawn']);
  });

  /* Speech already produced a message entry; a bar for it would double it up. */
  it('excludes speech, so talking is not counted as work', () => {
    const steps = [{ toolCalls: [call('send_chat_message'), call('finish')] }];
    expect(barsFor(steps)).toEqual([]);
  });

  it('flattens calls across every step of the turn, in order', () => {
    const steps = [
      { toolCalls: [call('list_agents')] },
      { toolCalls: [call('run_agent')] },
      { toolCalls: [call('send_chat_message')] },
      { toolCalls: [call('write_document')] }
    ];
    expect(barsFor(steps)).toEqual(['ok', 'spawn', 'ok']);
  });

  it('tolerates a step that called nothing', () => {
    expect(barsFor([{}, { toolCalls: [] }])).toEqual([]);
  });

  it('agrees with SPEECH about what counts as talking', () => {
    expect([...SPEECH].every(name => barsFor([{ toolCalls: [call(name)] }]).length === 0)).toBe(true);
  });
});

describe('detailOf', () => {
  it('summarises with the first string argument', () => {
    expect(detailOf({ id: 'eval-harness' })).toBe('eval-harness');
  });

  it('skips non-string arguments', () => {
    expect(detailOf({ count: 3, task: 'find prior art' })).toBe('find prior art');
  });

  it('truncates a long argument so the drawer column holds one line', () => {
    const detail = detailOf({ task: 'x'.repeat(200) });
    expect(detail).toHaveLength(80);
    expect(detail.endsWith('...')).toBe(true);
  });

  it('leaves a value at the limit untruncated', () => {
    expect(detailOf({ task: 'y'.repeat(80) })).toBe('y'.repeat(80));
  });

  it('returns empty for a tool that takes no arguments', () => {
    expect(detailOf({})).toBe('');
    expect(detailOf(undefined)).toBe('');
  });
});

describe('describe', () => {
  it('uses the error message', () => {
    expect(errorLine(new Error('Authentication Fails'))).toBe('Authentication Fails');
  });

  /* Provider errors dump headers and a body; the thread gets the first line only. */
  it('keeps only the first line of a multi-line provider error', () => {
    const err = new Error('Authentication Fails, your api key is invalid\nstatusCode: 401\n{...}');
    expect(errorLine(err)).toBe('Authentication Fails, your api key is invalid');
  });

  it('falls back to the value when it is not an error object', () => {
    expect(errorLine('socket hang up')).toBe('socket hang up');
    expect(errorLine(undefined)).toBe('undefined');
  });
});
