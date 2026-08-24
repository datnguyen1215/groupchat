import type { RequestHandler } from './$types';
import { subscribe } from '$lib/server/events/bus';
import { keyOf } from '$lib/server/events/types';

/** Below any proxy's idle timeout, so an quiet connection is never cut as dead. */
const HEARTBEAT_MS = 25_000;

/**
 * One connection for the whole app. Every scope goes down this stream and the
 * client decides what it cares about — a per-thread endpoint would mean tearing
 * the connection down and rebuilding it on every navigation, and would still
 * miss the thread-list updates the sidebar needs on every page.
 */
export const GET: RequestHandler = ({ request }) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;

      const send = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          /** Client vanished between the abort signal and this write. */
          close();
        }
      };

      const unsubscribe = subscribe(event => send(`data: ${keyOf(event)}\n\n`));

      /** Comment frames: ignored by EventSource, enough to hold the socket open. */
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

      function close() {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /** Already closed by the runtime. */
        }
      }

      request.signal.addEventListener('abort', close);

      /** Flush headers, so the browser fires `onopen` before the first event. */
      send(': connected\n\n');
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      /** Proxies that buffer would defeat the point of streaming. */
      'x-accel-buffering': 'no'
    }
  });
};
