import { describe, expect, it, vi } from 'vitest';

/**
 * `loop.ts` reaches the database and `$env/dynamic/private` through its imports,
 * neither of which belongs in a unit test. Stubbing them leaves the pure
 * helpers — how a turn becomes a sparkline, and what the drawer shows.
 */
vi.mock('$env/dynamic/private', () => ({ env: { DEEPSEEK_API_KEY: 'test' } }));
vi.mock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

const { SPEECH, barsFor, describe: errorLine } = await import('../../src/lib/server/ai/loop');

const { detailOf } = await import('../../src/lib/server/ai/detail');

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
    expect([...SPEECH].every(name => barsFor([{ toolCalls: [call(name)] }]).length === 0)).toBe(
      true
    );
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
  const providerError = (statusCode: number, message: string) =>
    Object.assign(new Error(message), { statusCode });

  it('names the failure by status, without quoting the provider', () => {
    expect(errorLine(providerError(401, 'anything'))).toBe(
      'the model provider rejected our credentials'
    );
    expect(errorLine(providerError(429, 'anything'))).toBe(
      'the model provider is rate limiting us'
    );
    expect(errorLine(providerError(503, 'anything'))).toBe('the model provider is having trouble');
  });

  /**
   * The reason this maps instead of passing through: the provider's auth error
   * quotes part of the API key, and this string is stored as a chat message.
   */
  it('never leaks the provider message, key fragments included', () => {
    const leaky = providerError(401, 'Authentication Fails, Your api key: ****316c is invalid');
    const line = errorLine(leaky);

    expect(line).not.toContain('316c');
    expect(line).not.toContain('api key');
    expect(line).not.toContain('Authentication Fails');
  });

  it('falls back without inspecting the value when there is no status', () => {
    expect(errorLine(new Error('socket hang up: 10.0.0.4:5432'))).toBe(
      'something went wrong on our side'
    );
    expect(errorLine('raw string')).toBe('something went wrong on our side');
    expect(errorLine(undefined)).toBe('something went wrong on our side');
  });

  it('groups unrecognised 4xx and 5xx rather than passing them through', () => {
    expect(errorLine(providerError(418, 'teapot'))).toBe('the model provider rejected the request');
    expect(errorLine(providerError(599, 'unknown'))).toBe('the model provider is having trouble');
  });
});
