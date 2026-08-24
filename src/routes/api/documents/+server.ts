import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { agentExists, getDocument, listDocuments, threadExists, uniqueId } from '$lib/server/repo';

export const GET: RequestHandler = async ({ url }) => {
  const threadId = url.searchParams.get('threadId') ?? undefined;
  const all = await listDocuments(threadId);
  const query = url.searchParams.get('q')?.trim().toLowerCase();

  const filtered = query
    ? all.filter(d => `${d.name} ${d.threadName} ${d.author}`.toLowerCase().includes(query))
    : all;
  return ok({ documents: filtered });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await readJson(request);
  const f = new Fields(body);

  const name = f.string('name', { required: true, max: 120 });
  const threadId = f.string('threadId', { required: true });
  const authorId = f.string('authorId', { required: true });
  const text = f.string('body', { max: 500_000, allowEmpty: true }) ?? '';
  f.check();

  const problems = [];
  if (!(await threadExists(threadId!)))
    problems.push({ field: 'threadId', message: 'no such thread' });
  if (!(await agentExists(authorId!)))
    problems.push({ field: 'authorId', message: 'no such agent' });
  if (problems.length) fail(422, 'Validation failed', problems);

  const id = await uniqueId(documents, name!);
  await db
    .insert(documents)
    .values({ id, name: name!, threadId: threadId!, authorId: authorId!, body: text });

  return ok({ document: await getDocument(id) }, 201);
};
