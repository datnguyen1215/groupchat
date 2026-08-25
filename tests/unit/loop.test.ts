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
  appendError: vi.fn(),
  appendStep: vi.fn(),
  listEntries: vi.fn()
}));

const {
  SILENT,
  nameFor,
  recordSteps,
  stateFor,
  delegating,
  describe: errorLine,
  sentence
} = await import('../../src/lib/server/ai/loop');

const { detailOf, summarise } = await import('../../src/lib/server/ai/detail');

const repoMock = await import('../../src/lib/server/repo');

const call = (toolName: string) => ({ toolName, input: {} });

/**
 * The feed is the whole turn, not just the tools. These two decide what each
 * call looks like in it: `stateFor` picks the dot, `nameFor` the label.
 */
describe('stateFor', () => {
  it('leaves an ordinary tool call as work', () => {
    expect(stateFor('list_skills')).toBe('ok');
    expect(stateFor('search_documents')).toBe('ok');
  });

  it('marks a delegation as a spawn', () => {
    expect(stateFor('run_agent')).toBe('spawn');
  });

  /* The point of the change: talking is activity, and shows in the feed. */
  it('marks talking as speech, not work', () => {
    expect(stateFor('send_chat_message')).toBe('say');
  });

  it('marks both document writes as document activity', () => {
    expect(stateFor('write_document')).toBe('doc');
    expect(stateFor('update_document')).toBe('doc');
  });

  it('falls back to work for a tool it has never seen', () => {
    expect(stateFor('some_future_tool')).toBe('ok');
  });
});

describe('nameFor', () => {
  it('names the agent for the things it is judged by', () => {
    expect(nameFor('Wren', 'send_chat_message')).toBe('Wren commented');
    expect(nameFor('Wren', 'write_document')).toBe('Wren wrote document');
    expect(nameFor('Wren', 'update_document')).toBe('Wren updated document');
  });

  it('keeps the raw tool name for a working call', () => {
    expect(nameFor('Wren', 'web_search')).toBe('web_search');
    expect(nameFor('Wren', 'run_agent')).toBe('run_agent');
  });
});

describe('SILENT', () => {
  /* Ending a turn is not an event. Everything else an agent does is. */
  it('drops only the turn-ending call', () => {
    expect([...SILENT]).toEqual(['finish']);
  });

  it('keeps speech, which used to be dropped', () => {
    expect(SILENT.has('send_chat_message')).toBe(false);
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

/**
 * A comment row is the one the reader is scanning for, and
 * `send_chat_message` carries no plain string — only `{ paragraphs: [...] }`.
 * `detailOf` alone would leave it blank.
 */
describe('summarise', () => {
  it('reads the paragraphs a comment carries', () => {
    expect(summarise({ paragraphs: ['BEIR is the baseline.', 'But our corpus differs.'] })).toBe(
      'BEIR is the baseline. But our corpus differs.'
    );
  });

  it('prefers a plain string argument when there is one', () => {
    expect(summarise({ name: 'eval-protocol', body: 'long markdown' })).toBe('eval-protocol');
  });

  it('truncates a long comment to one line', () => {
    const detail = summarise({ paragraphs: ['x'.repeat(200)] });
    expect(detail).toHaveLength(80);
    expect(detail.endsWith('...')).toBe(true);
  });

  it('returns empty when there is nothing to say', () => {
    expect(summarise({})).toBe('');
    expect(summarise({ count: 3 })).toBe('');
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
 * `describe` returns a lowercase fragment so it can tail the worker's report to
 * the orchestrator. The error entry shows it alone, so it is capped there.
 */
describe('sentence', () => {
  it('caps a fragment so it stands alone as a line', () => {
    expect(sentence('the model provider timed out')).toBe('The model provider timed out');
  });

  it('caps every wording describe can produce', () => {
    const statuses = [401, 403, 408, 429, 500, 504, 418, undefined];
    for (const status of statuses) {
      const line = sentence(errorLine(status ? { statusCode: status } : undefined));
      expect(line[0]).toBe(line[0].toUpperCase());
    }
  });

  it('leaves the rest of the fragment untouched', () => {
    expect(sentence('the model provider is rate limiting us')).toBe(
      'The model provider is rate limiting us'
    );
  });

  it('tolerates an empty fragment', () => {
    expect(sentence('')).toBe('');
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

/**
 * Step rows carry how long each call took. They are written after the turn
 * ends — the SDK's `steps` carry the calls but not their timings — so the
 * durations come from the array `traced` fills as the calls run.
 *
 * A row with no timing renders as "running", which is right for a call still
 * in flight and wrong for one that finished. Every completed call must land a
 * number.
 */
describe('recordSteps durations', () => {
  const appendStep = vi.mocked(repoMock.appendStep);

  const idCall = (toolName: string, toolCallId: string) => ({ toolName, toolCallId, input: {} });

  beforeEach(() => appendStep.mockClear());

  const durations = () => appendStep.mock.calls.map(([arg]) => arg.durationMs);

  it('gives each call the duration traced recorded against its id', async () => {
    const turn = [{ toolCalls: [idCall('search_documents', 'a'), idCall('write_document', 'b')] }];
    await recordSteps(
      't1',
      'Wren',
      turn,
      new Map([
        ['a', 12],
        ['b', 3400]
      ])
    );
    expect(durations()).toEqual([12, 3400]);
  });

  it('leaves a call without a timing null rather than borrowing one', async () => {
    const turn = [{ toolCalls: [idCall('search_documents', 'a'), idCall('write_document', 'b')] }];
    await recordSteps('t1', 'Wren', turn, new Map([['a', 12]]));
    expect(durations()).toEqual([12, null]);
  });

  it('records nothing rather than guessing when no timings arrived', async () => {
    await recordSteps('t1', 'Wren', [{ toolCalls: [idCall('search_documents', 'a')] }]);
    expect(durations()).toEqual([null]);
  });

  /**
   * The calls in one step run concurrently and finish in an order the step
   * list does not predict, so a duration has to find its own row by id.
   */
  it('holds each duration to its own row when calls finish out of order', async () => {
    const turn = [
      {
        toolCalls: [
          idCall('send_chat_message', 'first'),
          idCall('send_chat_message', 'second'),
          idCall('send_chat_message', 'third')
        ]
      }
    ];
    const timings = new Map([
      ['third', 9],
      ['first', 1],
      ['second', 5]
    ]);
    await recordSteps('t1', 'Finch', turn, timings);
    expect(durations()).toEqual([1, 5, 9]);
  });

  /**
   * A turn is many steps, and the ids stay unique across all of them — the
   * `call_NN` prefix restarts each step but the suffix does not repeat. Rows
   * from later steps have to keep their own durations.
   */
  it('keeps durations with their rows across steps', async () => {
    const turn = [
      { toolCalls: [idCall('read_skill', 'call_00_aaa')] },
      { toolCalls: [idCall('send_chat_message', 'call_00_bbb')] },
      { toolCalls: [idCall('send_chat_message', 'call_00_ccc')] }
    ];
    const timings = new Map([
      ['call_00_aaa', 13],
      ['call_00_bbb', 7],
      ['call_00_ccc', 4]
    ]);
    await recordSteps('t1', 'Wren', turn, timings);
    expect(durations()).toEqual([13, 7, 4]);
  });

  it('skips finish but still times everything the feed keeps', async () => {
    const turn = [
      {
        toolCalls: [
          idCall('search_documents', 'a'),
          idCall('send_chat_message', 'b'),
          idCall('finish', 'c')
        ]
      }
    ];
    await recordSteps(
      't1',
      'Wren',
      turn,
      new Map([
        ['a', 12],
        ['b', 3400]
      ])
    );
    expect(durations()).toEqual([12, 3400]);
    expect(appendStep.mock.calls.map(([arg]) => arg.name)).toEqual([
      'search_documents',
      'Wren commented'
    ]);
  });
});
