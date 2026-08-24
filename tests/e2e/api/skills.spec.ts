import { expect, test } from '@playwright/test';

/**
 * Every mutating test creates its own uniquely-named row rather than editing the
 * baseline, so the file is safe under `fullyParallel`.
 */
const unique = (label: string) => `${label}-${test.info().parallelIndex}-${Date.now()}`;

test.describe('GET /api/skills', () => {
	test('lists seeded skills with the fixture-shaped fields', async ({ request }) => {
		const res = await request.get('/api/skills');
		expect(res.status()).toBe(200);

		const { skills } = await res.json();
		const harness = skills.find((s: { id: string }) => s.id === 'eval-harness');
		expect(harness).toMatchObject({
			name: 'eval-harness',
			version: 'v4',
			versionNumber: 4,
			author: 'You',
			authorInitials: 'DN',
			authoredBy: 'you'
		});
		expect(typeof harness.updatedAt).toBe('string');
	});

	test('filters by authoredBy', async ({ request }) => {
		const res = await request.get('/api/skills?authoredBy=agent');
		const { skills } = await res.json();
		expect(skills.length).toBeGreaterThan(0);
		expect(skills.every((s: { authoredBy: string }) => s.authoredBy === 'agent')).toBe(true);
	});

	test('searches name and description', async ({ request }) => {
		const { skills } = await (await request.get('/api/skills?q=metric+sweep')).json();
		expect(skills.map((s: { id: string }) => s.id)).toContain('eval-harness');
	});

	test('returns an empty list rather than 404 when nothing matches', async ({ request }) => {
		const res = await request.get('/api/skills?q=zzzznotathing');
		expect(res.status()).toBe(200);
		expect((await res.json()).skills).toEqual([]);
	});
});

test.describe('GET /api/skills/:id', () => {
	test('derives usedBy from the agent_skills join', async ({ request }) => {
		const { skill } = await (await request.get('/api/skills/eval-harness')).json();
		expect(skill.usedBy).toContain('Kestrel');
	});

	test('404s for an unknown id', async ({ request }) => {
		const res = await request.get('/api/skills/does-not-exist');
		expect(res.status()).toBe(404);
		expect((await res.json()).message).toBe('Skill not found');
	});
});

test.describe('POST /api/skills', () => {
	test('creates at version 1 with a slugged id', async ({ request }) => {
		const name = unique('Created Skill');
		const res = await request.post('/api/skills', {
			data: { name, description: 'made by a test', authorId: 'you', authoredBy: 'you', body: '# x' }
		});
		expect(res.status()).toBe(201);

		const { skill } = await res.json();
		expect(skill.id).toBe(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
		expect(skill).toMatchObject({ version: 'v1', uses: 0, usedBy: [], author: 'You' });
	});

	test('suffixes the id when the slug is taken', async ({ request }) => {
		const name = unique('Duplicate Skill');
		const body = { name, authorId: 'you', authoredBy: 'you' };

		const first = await (await request.post('/api/skills', { data: body })).json();
		const second = await (await request.post('/api/skills', { data: body })).json();

		expect(second.skill.id).toBe(`${first.skill.id}-2`);
	});

	test('reports every missing required field at once', async ({ request }) => {
		const res = await request.post('/api/skills', { data: {} });
		expect(res.status()).toBe(422);

		const { invalid } = await res.json();
		expect(invalid.map((i: { field: string }) => i.field)).toEqual([
			'name',
			'authorId',
			'authoredBy'
		]);
	});

	test('rejects an authorId that is not an agent', async ({ request }) => {
		const res = await request.post('/api/skills', {
			data: { name: unique('Ghost'), authorId: 'nobody', authoredBy: 'you' }
		});
		expect(res.status()).toBe(422);
		expect((await res.json()).invalid[0]).toEqual({ field: 'authorId', message: 'no such agent' });
	});

	test('rejects a body that is not a JSON object', async ({ request }) => {
		const res = await request.post('/api/skills', {
			headers: { 'content-type': 'application/json' },
			data: '[]'
		});
		expect(res.status()).toBe(400);
	});
});

test.describe('PATCH /api/skills/:id', () => {
	const seedOne = async (request: import('@playwright/test').APIRequestContext) => {
		const res = await request.post('/api/skills', {
			data: { name: unique('Patch Target'), authorId: 'you', authoredBy: 'you', body: '# before' }
		});
		return (await res.json()).skill;
	};

	test('bumps the version when the body changes', async ({ request }) => {
		const created = await seedOne(request);
		const res = await request.patch(`/api/skills/${created.id}`, { data: { body: '# after' } });

		const { skill } = await res.json();
		expect(skill.version).toBe('v2');
		expect(skill.body).toBe('# after');
	});

	test('does not bump when only uses changes', async ({ request }) => {
		const created = await seedOne(request);
		const { skill } = await (
			await request.patch(`/api/skills/${created.id}`, { data: { uses: 42 } })
		).json();

		expect(skill.version).toBe('v1');
		expect(skill.uses).toBe(42);
	});

	test('rejects an empty patch', async ({ request }) => {
		const created = await seedOne(request);
		const res = await request.patch(`/api/skills/${created.id}`, { data: {} });
		expect(res.status()).toBe(400);
	});

	test('404s for an unknown id', async ({ request }) => {
		const res = await request.patch('/api/skills/nope', { data: { body: 'x' } });
		expect(res.status()).toBe(404);
	});
});

test.describe('DELETE /api/skills/:id', () => {
	test('removes the skill and detaches it from agents', async ({ request }) => {
		const { skill } = await (
			await request.post('/api/skills', {
				data: { name: unique('Doomed'), authorId: 'you', authoredBy: 'you' }
			})
		).json();

		/** A throwaway agent, so mutating its skills cannot race a test reading a seeded one. */
		const { agent } = await (
			await request.post('/api/agents', {
				data: { name: unique('Holder'), kind: 'research', skills: [skill.id] }
			})
		).json();
		expect(agent.skills).toContain(skill.id);

		expect((await request.delete(`/api/skills/${skill.id}`)).status()).toBe(204);
		expect((await request.get(`/api/skills/${skill.id}`)).status()).toBe(404);

		/** The join row cascaded rather than dangling. */
		const after = await (await request.get(`/api/agents/${agent.id}`)).json();
		expect(after.agent.skills).not.toContain(skill.id);
	});

	test('404s for an unknown id', async ({ request }) => {
		expect((await request.delete('/api/skills/nope')).status()).toBe(404);
	});
});
