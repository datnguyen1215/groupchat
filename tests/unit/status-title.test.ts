import { describe, expect, it, vi } from 'vitest';

/**
 * The live status line: the `set_status` tool the agent calls to say what it is
 * working on, and the step rows `traced` writes as each call finishes.
 *
 * Both are tested through the real tool set rather than in isolation, because
 * what matters is what happens when the model calls a tool — the wrapper and
 * the tool are the same code path from the agent's side.
 */
const build = async () => {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env: {} }));
  vi.doMock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

  const appendStep = vi.fn(async () => 'step-1');
  const setAgentStatusTitle = vi.fn(async () => undefined);

  vi.doMock('../../src/lib/server/repo', () => ({
    listDocuments: async () => [],
    getDocument: async () => null,
    createDocument: async () => 'doc-1',
    deleteDocument: async () => undefined,
    updateDocument: async () => undefined,
    appendMessage: async () => 'entry-1',
    listSkills: async () => [],
    getSkill: async () => null,
    listAgents: async () => [],
    getAgent: async () => null,
    appendStep,
    setAgentStatusTitle
  }));

  const { workerTools } = await import('../../src/lib/server/ai/tools');
  const tools = workerTools({
    threadId: 't1',
    agentId: 'a1',
    agentName: 'Wren',
    tag: 'research'
  });

  const options = {} as never;
  return { tools, appendStep, setAgentStatusTitle, options };
};

describe('set_status', () => {
  it('writes the title against the calling agent', async () => {
    const { tools, setAgentStatusTitle, options } = await build();

    await tools.set_status.execute!({ title: 'Comparing payment terms' }, options);

    expect(setAgentStatusTitle).toHaveBeenCalledWith('a1', 'Comparing payment terms');
  });

  /** The row is one line beside an avatar; a sentence would be ellipsised anyway. */
  it('truncates a title past the cap rather than rejecting it', async () => {
    const { tools, setAgentStatusTitle, options } = await build();

    await tools.set_status.execute!({ title: 'x'.repeat(200) }, options);

    const [, written] = setAgentStatusTitle.mock.calls[0];
    expect(written.length).toBe(60);
  });

  it('trims surrounding whitespace', async () => {
    const { tools, setAgentStatusTitle, options } = await build();

    await tools.set_status.execute!({ title: '  Reading the quotes\n' }, options);

    expect(setAgentStatusTitle).toHaveBeenCalledWith('a1', 'Reading the quotes');
  });

  /** A blank title would blank the row mid-turn, which reads as "stopped". */
  it('rejects an empty title instead of clearing the row', async () => {
    const { tools, setAgentStatusTitle, options } = await build();

    const out = await tools.set_status.execute!({ title: '   ' }, options);

    expect(out).toHaveProperty('error');
    expect(setAgentStatusTitle).not.toHaveBeenCalled();
  });

  /**
   * The title already renders on the presence row. Recording it as a step too
   * would caption the history with a commentary on itself.
   */
  it('leaves no step behind', async () => {
    const { tools, appendStep, options } = await build();

    await tools.set_status.execute!({ title: 'Reading the quotes' }, options);

    expect(appendStep).not.toHaveBeenCalled();
  });
});

/**
 * Steps are written as each call finishes, not swept up after the turn. The
 * presence row shows what an agent has already done, and a row written at the
 * end of the turn arrives after the only moment it had a reader.
 */
describe('live step writing', () => {
  it('writes a step as the call finishes', async () => {
    const { tools, appendStep, options } = await build();

    await tools.list_documents.execute!({}, options);

    expect(appendStep).toHaveBeenCalledTimes(1);
    expect(appendStep.mock.calls[0][0]).toMatchObject({
      threadId: 't1',
      groupLabel: 'Wren',
      name: 'list_documents',
      state: 'ok'
    });
  });

  /** The duration is measured in the wrapper, so every completed call lands one. */
  it('gives every completed call a duration', async () => {
    const { tools, appendStep, options } = await build();

    await tools.list_documents.execute!({}, options);

    expect(typeof appendStep.mock.calls[0][0].durationMs).toBe('number');
  });

  it('labels the step with the agent that ran it, not the tool set', async () => {
    const { tools, appendStep, options } = await build();

    await tools.send_chat_message.execute!({ paragraphs: ['hello'] }, options);

    expect(appendStep.mock.calls[0][0]).toMatchObject({
      groupLabel: 'Wren',
      name: 'Wren commented',
      state: 'say'
    });
  });

  it('drops the turn-ending call', async () => {
    const { tools, appendStep, options } = await build();

    await tools.finish.execute!({}, options);

    expect(appendStep).not.toHaveBeenCalled();
  });

  /** A call that threw still took the time it took, and still happened. */
  it('records a step for a call that threw', async () => {
    const { tools, appendStep, options } = await build();

    await expect(tools.read_document.execute!({ id: 'missing' }, options)).resolves.toBeDefined();
    expect(appendStep).toHaveBeenCalledTimes(1);
  });
});
