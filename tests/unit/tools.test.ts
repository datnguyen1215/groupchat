import { describe, expect, it, vi } from 'vitest';

/**
 * `tools.ts` reaches the database and `$env/dynamic/private` through its
 * imports. Stubbing them leaves the pure helper — how a search hit is
 * turned into a skimmable excerpt.
 */
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));

const { excerpt, withoutDocEcho } = await import('../../src/lib/server/ai/tools');

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

/**
 * Documents are thread-scoped. An agent works in one chat and sees that chat's
 * documents — nothing from a thread it is not in.
 *
 * This is the bug the scoping exists to prevent: agents once found another
 * thread's documents, decided the work was already done, and wrote nothing.
 */
describe('document tools are scoped to the thread', () => {
  const docs = [
    { id: 'mine', name: 'mine', body: 'retrieval eval', threadId: 't1', author: 'Kestrel' },
    { id: 'theirs', name: 'theirs', body: 'retrieval eval', threadId: 't2', author: 'Wren' }
  ];

  const build = async () => {
    vi.resetModules();
    vi.doMock('$env/dynamic/private', () => ({ env: {} }));
    vi.doMock('../../src/lib/server/db', () => ({ db: {}, schema: {} }));
    vi.doMock('../../src/lib/server/repo', () => ({
      listDocuments: async (threadId?: string) =>
        threadId ? docs.filter(d => d.threadId === threadId) : docs,
      getDocument: async (id: string) => docs.find(d => d.id === id) ?? null,
      uniqueId: async (_t: unknown, name: string) => name,
      db: {},
      appendMessage: async () => 'entry-1',
      listSkills: async () => [],
      getSkill: async () => null,
      listAgents: async () => [],
      getAgent: async () => null
    }));
    const { workerTools } = await import('../../src/lib/server/ai/tools');
    return workerTools({ threadId: 't1', agentId: 'kestrel', tag: 'w' });
  };

  it('lists only this thread’s documents', async () => {
    const tools = await build();
    const out = (await tools.list_documents.execute({}, {} as never)) as { id: string }[];
    expect(out.map(d => d.id)).toEqual(['mine']);
  });

  it('searches only this thread, even when another thread matches', async () => {
    const tools = await build();
    const out = (await tools.search_documents.execute(
      { query: 'retrieval eval' },
      {} as never
    )) as { id: string }[];
    expect(out.map(d => d.id)).toEqual(['mine']);
  });

  it('refuses to read a document belonging to another thread', async () => {
    const tools = await build();
    const out = await tools.read_document.execute({ id: 'theirs' }, {} as never);
    expect(out).toEqual({ error: 'No document with id "theirs".' });
  });

  it('still reads a document in this thread', async () => {
    const tools = await build();
    const out = await tools.read_document.execute({ id: 'mine' }, {} as never);
    expect(out).toMatchObject({ id: 'mine' });
  });
});

/**
 * One live document per name, per thread. The orchestrator's habit is to record
 * a decision as a brand-new document rather than an edit to the one it decided
 * on, which leaves two documents of the same name and no way to tell which is
 * current. `uniqueId` would have suffixed the id and hidden the collision.
 */
describe('write_document refuses a name the thread already uses', () => {
  const build = async (docs: { id: string; name: string; threadId: string }[]) => {
    vi.resetModules();
    vi.doMock('$env/dynamic/private', () => ({ env: {} }));
    vi.doMock('../../src/lib/server/db', () => ({
      db: { insert: () => ({ values: async () => undefined }) },
      schema: {}
    }));
    vi.doMock('../../src/lib/server/repo', () => ({
      listDocuments: async (threadId?: string) =>
        threadId ? docs.filter(d => d.threadId === threadId) : docs,
      getDocument: async (id: string) => docs.find(d => d.id === id) ?? null,
      uniqueId: async (_t: unknown, name: string) => name,
      appendMessage: async () => 'entry-1',
      listSkills: async () => [],
      getSkill: async () => null,
      listAgents: async () => [],
      getAgent: async () => null
    }));
    const { workerTools } = await import('../../src/lib/server/ai/tools');
    return workerTools({ threadId: 't1', agentId: 'orchestrator', tag: 'w' });
  };

  const existing = [{ id: 'eval-protocol', name: 'eval-protocol', threadId: 't1' }];

  it('points at the existing document instead of writing a second copy', async () => {
    const tools = await build(existing);
    const out = await tools.write_document.execute(
      { name: 'eval-protocol', body: '# again' },
      {} as never
    );
    expect(out).toMatchObject({ id: 'eval-protocol' });
    expect((out as { error?: string }).error).toContain('update_document');
  });

  it('ignores case and surrounding space when matching the name', async () => {
    const tools = await build(existing);
    const out = await tools.write_document.execute(
      { name: '  Eval-Protocol  ', body: '# again' },
      {} as never
    );
    expect((out as { error?: string }).error).toBeDefined();
  });

  it('allows the same name when it belongs to another thread', async () => {
    const tools = await build([{ id: 'eval-protocol', name: 'eval-protocol', threadId: 't2' }]);
    const out = await tools.write_document.execute(
      { name: 'eval-protocol', body: '# mine' },
      {} as never
    );
    expect((out as { error?: string }).error).toBeUndefined();
  });

  it('allows a genuinely new name', async () => {
    const tools = await build(existing);
    const out = await tools.write_document.execute(
      { name: 'eval-costs', body: '# costs' },
      {} as never
    );
    expect(out).toMatchObject({ name: 'eval-costs' });
  });
});

/**
 * The id belongs in `docId`, which renders as an attachment chip. Models both
 * fill the field and echo it into the text, and skip the field and write the
 * id into the text instead — the second leaves a document with no chip.
 */
describe('withoutDocEcho', () => {
  const say = 'Drafted the survey. Short version: recall@k + MRR.';

  it('drops a trailing paragraph that only echoes the id', () => {
    expect(withoutDocEcho([say, 'docId: eval-design'], 'eval-design')).toEqual({
      paragraphs: [say],
      docId: 'eval-design'
    });
  });

  it('accepts the spellings a model reaches for', () => {
    for (const line of [
      'docId=eval-design',
      'doc_id: eval-design',
      'DocumentId: eval-design',
      '  docid : "eval-design"  '
    ])
      expect(withoutDocEcho([say, line], 'eval-design').paragraphs).toEqual([say]);
  });

  it('adopts the echoed id when the field was left empty', () => {
    expect(withoutDocEcho([say, 'docId: eval-design'], undefined)).toEqual({
      paragraphs: [say],
      docId: 'eval-design'
    });
  });

  it('keeps the passed field when the text echoes a different id', () => {
    const out = withoutDocEcho([say, 'docId: other-doc'], 'eval-design');
    expect(out.docId).toBe('eval-design');
    expect(out.paragraphs).toEqual([say, 'docId: other-doc']);
  });

  it('keeps a sentence that merely mentions the id', () => {
    const line = 'The detail is in eval-design if you want it.';
    expect(withoutDocEcho([say, line], 'eval-design').paragraphs).toEqual([say, line]);
  });

  it('keeps everything when the echo is the only paragraph', () => {
    const out = withoutDocEcho(['docId: eval-design'], 'eval-design');
    expect(out.paragraphs).toEqual(['docId: eval-design']);
    expect(out.docId).toBe('eval-design');
  });

  it('leaves plain text alone when nothing is attached', () => {
    expect(withoutDocEcho([say, 'Second point.'], undefined)).toEqual({
      paragraphs: [say, 'Second point.'],
      docId: undefined
    });
  });

  it('drops blank paragraphs', () => {
    expect(withoutDocEcho([say, '   '], undefined).paragraphs).toEqual([say]);
  });
});
