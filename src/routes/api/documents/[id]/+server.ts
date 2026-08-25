import type { RequestHandler } from './$types';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { deleteDocument, getDocument, threadExists, updateDocument } from '$lib/server/repo';

export const GET: RequestHandler = async ({ params }) => {
  const document = await getDocument(params.id);
  if (!document) fail(404, 'Document not found');
  return ok({ document });
};

/** Same in-place version bump as skills; the modal's History button has no backing store. */
export const PATCH: RequestHandler = async ({ params, request }) => {
  const existing = await getDocument(params.id);
  if (!existing) fail(404, 'Document not found');

  const body = await readJson(request);
  const f = new Fields(body);

  const patch: Record<string, unknown> = {};
  if (f.has('name')) patch.name = f.string('name', { required: true, max: 120 });
  if (f.has('body')) patch.body = f.string('body', { max: 500_000, allowEmpty: true });
  if (f.has('threadId')) patch.threadId = f.string('threadId', { required: true });
  f.check();

  if (!Object.keys(patch).length) fail(400, 'No writable fields in body');

  if (typeof patch.threadId === 'string' && !(await threadExists(patch.threadId)))
    fail(422, 'Validation failed', [{ field: 'threadId', message: 'no such thread' }]);

  await updateDocument(params.id, patch);

  return ok({ document: await getDocument(params.id) });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const existing = await getDocument(params.id);
  if (!existing) fail(404, 'Document not found');

  /** Messages referencing this doc keep their chip; `entries.doc_id` nulls out. */
  await deleteDocument(params.id);
  return new Response(null, { status: 204 });
};
