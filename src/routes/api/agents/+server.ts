import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { agents } from '$lib/server/db/schema';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { existingSkillIds, getAgent, listAgents, setAgentSkills, uniqueId } from '$lib/server/repo';

const KINDS = ['orchestrator', 'research', 'spawned', 'you'] as const;
const STATUSES = ['idle', 'busy', 'done'] as const;

/** Initials fall back to the name when the caller omits them, matching the fixtures. */
const initialsFrom = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('') || '?';

export const GET: RequestHandler = async ({ url }) => {
  const kind = url.searchParams.get('kind');
  if (kind && !KINDS.includes(kind as (typeof KINDS)[number]))
    fail(400, `kind must be one of: ${KINDS.join(', ')}`);

  return ok({ agents: await listAgents(kind as (typeof KINDS)[number] | undefined) });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await readJson(request);
  const f = new Fields(body);

  const name = f.string('name', { required: true, max: 80 });
  const kind = f.enum('kind', KINDS, { required: true });
  const role = f.string('role', { max: 120, allowEmpty: true }) ?? '';
  const description = f.string('description', { max: 600, allowEmpty: true }) ?? '';
  const color = f.string('color', { max: 32 }) ?? '#5b5b66';
  const initials = f.string('initials', { max: 4 });
  const status = f.enum('status', STATUSES) ?? 'idle';
  const statusLabel = f.string('statusLabel', { max: 32 }) ?? 'Idle';
  const instances = f.int('instances', { min: 1 }) ?? 1;
  const spawnedBy = f.string('spawnedBy', { max: 80 });
  const skillIds = f.stringArray('skills') ?? [];
  f.check();

  const known = await existingSkillIds(skillIds);
  const unknown = skillIds.filter(id => !known.has(id));
  if (unknown.length)
    fail(422, 'Validation failed', [
      { field: 'skills', message: `unknown skill ids: ${unknown.join(', ')}` }
    ]);

  const id = await uniqueId(agents, name!);
  await db.insert(agents).values({
    id,
    name: name!,
    initials: initials ?? initialsFrom(name!),
    color,
    kind: kind!,
    role,
    description,
    status,
    statusLabel,
    instances,
    spawnedBy: spawnedBy ?? null
  });
  await setAgentSkills(id, skillIds);

  return ok({ agent: await getAgent(id) }, 201);
};
