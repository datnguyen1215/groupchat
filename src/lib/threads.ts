import { logger } from '$lib/logger.svelte';

const log = logger('threads');

/**
 * Create a thread and return it. Shared by the sidebar's `+` and the empty
 * page's button so there is one creation path, not two that can drift.
 */
export const createThread = async (name = 'Untitled') => {
  log.info({ threadName: name }, 'create thread');

  const res = await fetch('/api/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });

  if (!res.ok) {
    log.error({ status: res.status }, 'create failed');
    return null;
  }

  const { thread } = await res.json();
  log.info({ threadId: thread.id }, 'created');
  return thread as { id: string; name: string };
};
