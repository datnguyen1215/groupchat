import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { skills } from '$lib/server/db/schema';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { agentExists, getSkill, listSkills, uniqueId } from '$lib/server/repo';

export const GET: RequestHandler = async ({ url }) => {
  const all = await listSkills();
  const authoredBy = url.searchParams.get('authoredBy');
  const query = url.searchParams.get('q')?.trim().toLowerCase();

  const filtered = all.filter(
    s =>
      (!authoredBy || s.authoredBy === authoredBy) &&
      (!query || `${s.name} ${s.description}`.toLowerCase().includes(query))
  );
  return ok({ skills: filtered });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await readJson(request);
  const f = new Fields(body);

  const name = f.string('name', { required: true, max: 80 });
  const description = f.string('description', { max: 400, allowEmpty: true }) ?? '';
  const text = f.string('body', { max: 100_000, allowEmpty: true }) ?? '';
  const authorId = f.string('authorId', { required: true });
  const authoredBy = f.enum('authoredBy', ['you', 'agent'] as const, { required: true });
  f.check();

  if (!(await agentExists(authorId!)))
    fail(422, 'Validation failed', [{ field: 'authorId', message: 'no such agent' }]);

  const id = await uniqueId(skills, name!);
  await db.insert(skills).values({
    id,
    name: name!,
    description,
    body: text,
    authorId: authorId!,
    authoredBy: authoredBy!
  });

  return ok({ skill: await getSkill(id) }, 201);
};
