import { expect, test } from '@playwright/test';

/**
 * The live stream, end to end: a write on one request has to reach a stream
 * opened by another. The bus is in-process, so this only holds while the app is
 * a single node — which is exactly the assumption worth a test.
 */

/** Reads frames off the stream until `match` is found, or the deadline passes. */
const waitForFrame = async (
  body: ReadableStream<Uint8Array>,
  match: string,
  timeoutMs = 10_000
) => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let seen = '';

  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += decoder.decode(value, { stream: true });
      if (seen.includes(match)) return seen;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return seen;
};

test('streams an event when a thread is renamed', async ({ request, playwright, baseURL }) => {
  const created = await request.post('/api/threads', { data: { name: 'Live stream probe' } });
  expect(created.ok()).toBeTruthy();
  const { thread } = await created.json();

  /**
   * Fetched outside Playwright's request fixture: that fixture buffers a
   * response to completion, and this one never completes.
   */
  const stream = await fetch(new URL('/api/events', baseURL).href, {
    headers: { accept: 'text/event-stream' }
  });
  expect(stream.status).toBe(200);
  expect(stream.headers.get('content-type')).toContain('text/event-stream');

  const frames = waitForFrame(stream.body!, `live:thread:${thread.id}`);

  /** Let the subscriber register before the write it is meant to observe. */
  await new Promise(r => setTimeout(r, 300));
  await request.patch(`/api/threads/${thread.id}`, { data: { name: 'Renamed while listening' } });

  const seen = await frames;
  expect(seen).toContain(`data: live:thread:${thread.id}`);
  expect(seen).toContain('data: live:threads');
});
