import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `loop.ts` reaches the database and `$env/dynamic/private` through its imports,
 * neither of which belongs in a unit test. Stubbing them leaves the pure
 * helpers — how a turn becomes a sparkline, and what the drawer shows.
 */
vi.mock('$env/dynamic/private', () => ({ env: { DEEPSEEK_API_KEY: 'test' } }));
vi.mock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

/**
 * `delegating` writes the status row it is hiding. The write is the behaviour
 * under test, so the repo is stubbed and the calls are the assertion.
 */
const setAgentStatus = vi.fn();
vi.mock('../../src/lib/server/repo', () => ({
  BLOCKED: 'Delegating',
  setAgentStatus: (...args: unknown[]) => setAgentStatus(...args),
  appendActivity: vi.fn(),
  appendMessage: vi.fn(),
  appendStep: vi.fn(),
  listEntries: vi.fn()
}));

const {
  SPEECH,
  barsFor,
  delegating,
  describe: errorLine
} = await import('../../src/lib/server/ai/loop');

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

/**
 * The orchestrator's row is hidden while it waits on delegates. What matters is
 * the overlap: the SDK runs several `run_agent` calls from one step at the same
 * time, and the row must stay hidden until the last one returns.
 */
describe('delegating', () => {
  const statuses = () => setAgentStatus.mock.calls.map(c => c[2]);

  beforeEach(() => setAgentStatus.mockClear());

  it('hides the row while a delegate runs, and restores it after', async () => {
    await delegating('orch', 't1', async () => 'report');

    expect(statuses()).toEqual(['Delegating', 'Thinking']);
  });

  it('hands the delegate result straight back', async () => {
    expect(await delegating('orch', 't1', async () => 'report')).toBe('report');
  });

  it('marks the row busy, not idle, so the turn keeps its presence', async () => {
    await delegating('orch', 't1', async () => null);

    expect(setAgentStatus.mock.calls.every(c => c[1] === 'busy')).toBe(true);
  });

  /* Two workers from one step. Restoring on the first return shows the row too early. */
  it('stays hidden until the last of several concurrent delegates returns', async () => {
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>(resolve => (releaseSlow = resolve));

    const first = delegating('orch', 't1', async () => 'fast');
    const second = delegating('orch', 't1', () => slow.then(() => 'slow'));

    await first;
    expect(statuses()).toEqual(['Delegating']);

    releaseSlow();
    await second;
    expect(statuses()).toEqual(['Delegating', 'Thinking']);
  });

  it('restores the row when a delegate throws', async () => {
    await expect(
      delegating('orch', 't1', async () => {
        throw new Error('worker died');
      })
    ).rejects.toThrow('worker died');

    expect(statuses()).toEqual(['Delegating', 'Thinking']);
  });

  /* A later turn must not inherit a count left behind by an earlier one. */
  it('starts clean on a following turn', async () => {
    await delegating('orch', 't1', async () => null);
    setAgentStatus.mockClear();
    await delegating('orch', 't1', async () => null);

    expect(statuses()).toEqual(['Delegating', 'Thinking']);
  });
});
