import type { RequestHandler } from './$types';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { skills } from '$lib/server/db/schema';
import { Fields, fail, ok, readJson } from '$lib/server/api';
import { getSkill } from '$lib/server/repo';

export const GET: RequestHandler = async ({ params }) => {
	const skill = await getSkill(params.id);
	if (!skill) fail(404, 'Skill not found');
	return ok({ skill });
};

/**
 * Every write bumps `version` in place. There is no history table, so a bump is
 * the only record that the skill changed — an agent revising a skill you wrote
 * overwrites it rather than forking.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const existing = await getSkill(params.id);
	if (!existing) fail(404, 'Skill not found');

	const body = await readJson(request);
	const f = new Fields(body);

	const patch: Record<string, unknown> = {};
	if (f.has('name')) patch.name = f.string('name', { required: true, max: 80 });
	if (f.has('description'))
		patch.description = f.string('description', { max: 400, allowEmpty: true });
	if (f.has('body')) patch.body = f.string('body', { max: 100_000, allowEmpty: true });
	if (f.has('uses')) patch.uses = f.int('uses', { min: 0 });
	f.check();

	if (!Object.keys(patch).length) fail(400, 'No writable fields in body');

	/** A metadata-only touch (`uses`) is not a revision, so it does not bump. */
	const revised = ['name', 'description', 'body'].some((k) => k in patch);

	await db
		.update(skills)
		.set({
			...patch,
			...(revised ? { version: sql`${skills.version} + 1` } : {}),
			updatedAt: new Date()
		})
		.where(eq(skills.id, params.id));

	return ok({ skill: await getSkill(params.id) });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const existing = await getSkill(params.id);
	if (!existing) fail(404, 'Skill not found');

	/** `agent_skills` rows cascade, so attachment disappears with the skill. */
	await db.delete(skills).where(eq(skills.id, params.id));
	return new Response(null, { status: 204 });
};
