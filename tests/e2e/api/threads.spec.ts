import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { SEED_THREADS } from '../../../src/lib/server/db/seed-ids';

const unique = (label: string) => `${label}-${test.info().parallelIndex}-${Date.now()}`;

const create = async (request: APIRequestContext) => {
  const res = await request.post('/api/threads', { data: { name: unique('scratch') } });
  return (await res.json()).thread;
};

test.describe('DELETE /api/threads/[id]', () => {
  test('removes the thread', async ({ request }) => {
    const thread = await create(request);

    const res = await request.delete(`/api/threads/${thread.id}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: thread.id });

    expect((await request.get(`/api/threads/${thread.id}`)).status()).toBe(404);
  });

  test('drops it from the list', async ({ request }) => {
    const thread = await create(request);
    await request.delete(`/api/threads/${thread.id}`);

    const { threads } = await (await request.get('/api/threads')).json();
    expect(threads.map((t: { id: string }) => t.id)).not.toContain(thread.id);
  });

  /* The FKs cascade, so a thread with content must not 500 on the way out. */
  test('takes the thread documents with it', async ({ request }) => {
    const thread = await create(request);
    const doc = await (
      await request.post('/api/documents', {
        data: {
          name: `${unique('cascade')}.md`,
          threadId: thread.id,
          authorId: 'kestrel',
          body: '# Doc\n\nbody'
        }
      })
    ).json();

    expect((await request.delete(`/api/threads/${thread.id}`)).status()).toBe(200);
    expect((await request.get(`/api/documents/${doc.document.id}`)).status()).toBe(404);
  });

  test('404s for an unknown thread', async ({ request }) => {
    const res = await request.delete('/api/threads/00000000-0000-4000-8000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('is idempotent — a second delete 404s', async ({ request }) => {
    const thread = await create(request);

    expect((await request.delete(`/api/threads/${thread.id}`)).status()).toBe(200);
    expect((await request.delete(`/api/threads/${thread.id}`)).status()).toBe(404);
  });

  test('leaves the other threads alone', async ({ request }) => {
    const thread = await create(request);
    await request.delete(`/api/threads/${thread.id}`);

    expect((await request.get(`/api/threads/${SEED_THREADS.retrievalEval}`)).status()).toBe(200);
  });
});

/**
 * `titled` is what stops the generated title from ever running twice. It is
 * false on a new thread and true the moment anyone names it, so the generator
 * has one chance and a person's choice always wins.
 */
test.describe('thread titled flag', () => {
  test('a new thread is untitled', async ({ request }) => {
    const thread = await create(request);
    expect(thread.titled).toBe(false);
  });

  test('renaming marks it titled', async ({ request }) => {
    const thread = await create(request);

    const res = await request.patch(`/api/threads/${thread.id}`, {
      data: { name: unique('renamed') }
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).thread.titled).toBe(true);
  });

  /* Renaming it back to the default is still a choice. The flag must stick. */
  test('stays titled when renamed to the default name', async ({ request }) => {
    const thread = await create(request);
    await request.patch(`/api/threads/${thread.id}`, { data: { name: 'New thread' } });

    const { thread: after } = await (await request.get(`/api/threads/${thread.id}`)).json();
    expect(after.name).toBe('New thread');
    expect(after.titled).toBe(true);
  });
});
