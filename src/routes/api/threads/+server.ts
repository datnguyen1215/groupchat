import type { RequestHandler } from './$types';
import { Fields, ok, readJson } from '$lib/server/api';
import { createThread, getThread, listThreads } from '$lib/server/repo';

export const GET: RequestHandler = async () => ok({ threads: await listThreads() });

export const POST: RequestHandler = async ({ request }) => {
  const body = await readJson(request);
  const f = new Fields(body);
  const name = f.string('name', { max: 120 }) ?? 'Untitled';
  f.check();

  const id = await createThread(name);
  return ok({ thread: await getThread(id) }, 201);
};
