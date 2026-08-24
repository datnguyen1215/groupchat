import type { RequestHandler } from './$types';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { deleteThread, getThread, renameThread } from '$lib/server/repo';

export const GET: RequestHandler = async ({ params }) => {
  const thread = await getThread(params.id);
  if (!thread) fail(404, 'Thread not found');
  return ok({ thread });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  if (!(await getThread(params.id))) fail(404, 'Thread not found');

  const body = await readJson(request);
  const f = new Fields(body);
  const name = f.string('name', { required: true, max: 120 });
  f.check();

  await renameThread(params.id, name!);
  return ok({ thread: await getThread(params.id) });
};

export const DELETE: RequestHandler = async ({ params }) => {
  if (!(await getThread(params.id))) fail(404, 'Thread not found');

  await deleteThread(params.id);
  return ok({ deleted: params.id });
};
