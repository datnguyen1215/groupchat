import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { agents } from '$lib/server/db/schema';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { existingSkillIds, getAgent, setAgentSkills } from '$lib/server/repo';

const KINDS = ['orchestrator', 'research', 'spawned', 'you'] as const;
const STATUSES = ['idle', 'busy', 'done'] as const;

export const GET: RequestHandler = async ({ params }) => {
  const agent = await getAgent(params.id);
  if (!agent) fail(404, 'Agent not found');
  return ok({ agent });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const existing = await getAgent(params.id);
  if (!existing) fail(404, 'Agent not found');

  const body = await readJson(request);
  const f = new Fields(body);

  const patch: Record<string, unknown> = {};
  if (f.has('name')) patch.name = f.string('name', { required: true, max: 80 });
  if (f.has('initials')) patch.initials = f.string('initials', { max: 4 });
  if (f.has('color')) patch.color = f.string('color', { max: 32 });
  if (f.has('kind')) patch.kind = f.enum('kind', KINDS, { required: true });
  if (f.has('role')) patch.role = f.string('role', { max: 120, allowEmpty: true });
  if (f.has('description'))
    patch.description = f.string('description', { max: 600, allowEmpty: true });
  if (f.has('status')) patch.status = f.enum('status', STATUSES, { required: true });
  if (f.has('statusLabel')) patch.statusLabel = f.string('statusLabel', { max: 32 });
  if (f.has('instances')) patch.instances = f.int('instances', { min: 1 });
  if (f.has('spawnedBy')) patch.spawnedBy = f.string('spawnedBy', { max: 80, allowEmpty: true });

  /** `skills` is a join, not a column — replaced separately and wholesale. */
  const skillIds = f.has('skills') ? f.stringArray('skills') : undefined;
  f.check();

  if (!Object.keys(patch).length && !skillIds) fail(400, 'No writable fields in body');

  if (skillIds) {
    const known = await existingSkillIds(skillIds);
    const unknown = skillIds.filter(id => !known.has(id));
    if (unknown.length)
      fail(422, 'Validation failed', [
        { field: 'skills', message: `unknown skill ids: ${unknown.join(', ')}` }
      ]);
  }

  if (Object.keys(patch).length)
    await db
      .update(agents)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(agents.id, params.id));

  if (skillIds) await setAgentSkills(params.id, skillIds);

  return ok({ agent: await getAgent(params.id) });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const existing = await getAgent(params.id);
  if (!existing) fail(404, 'Agent not found');

  /**
   * Skills and documents reference agents without a cascade — deleting an agent
   * that authored either would orphan those rows, so it is refused.
   */
  try {
    await db.delete(agents).where(eq(agents.id, params.id));
  } catch {
    fail(409, 'Agent still authors skills or documents');
  }
  return new Response(null, { status: 204 });
};
