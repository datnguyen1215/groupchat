import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const unique = (label: string) => `${label} ${test.info().parallelIndex} ${Date.now()}`;

const create = async (request: APIRequestContext, overrides: Record<string, unknown> = {}) => {
	const res = await request.post('/api/agents', {
		data: { name: unique('Agent'), kind: 'research', ...overrides }
	});
	return (await res.json()).agent;
};

test.describe('GET /api/agents', () => {
	test('returns the roster with joined skills and counted stats', async ({ request }) => {
		const { agents } = await (await request.get('/api/agents')).json();
		const kestrel = agents.find((a: { id: string }) => a.id === 'kestrel');

		expect(kestrel).toMatchObject({ name: 'Kestrel', initials: 'K', kind: 'research' });
		expect(kestrel.skills).toContain('eval-harness');
		/** Stats are counted from real rows, not stored. Kestrel authored one document. */
		expect(kestrel.stats).toContainEqual({ value: '1', label: 'docs' });
	});

	test('filters by kind', async ({ request }) => {
		const { agents } = await (await request.get('/api/agents?kind=orchestrator')).json();
		expect(agents).toHaveLength(1);
		expect(agents[0].id).toBe('orchestrator');
	});

	test('rejects an unknown kind rather than silently ignoring it', async ({ request }) => {
		const res = await request.get('/api/agents?kind=wrong');
		expect(res.status()).toBe(400);
		expect((await res.json()).message).toContain('kind must be one of');
	});
});

test.describe('POST /api/agents', () => {
	test('derives initials from the name when omitted', async ({ request }) => {
		const agent = await create(request, { name: 'Ada Lovelace' });
		expect(agent.initials).toBe('AL');
	});

	test('honours explicit initials', async ({ request }) => {
		const agent = await create(request, { initials: 'ZZ' });
		expect(agent.initials).toBe('ZZ');
	});

	test('attaches skills through the join', async ({ request }) => {
		const agent = await create(request, { skills: ['eval-harness', 'paper-reader'] });
		expect(agent.skills.sort()).toEqual(['eval-harness', 'paper-reader']);
	});

	test('rejects the whole request when any skill id is unknown', async ({ request }) => {
		const res = await request.post('/api/agents', {
			data: { name: unique('Bad'), kind: 'research', skills: ['eval-harness', 'ghost'] }
		});
		expect(res.status()).toBe(422);
		expect((await res.json()).invalid[0].message).toContain('ghost');
	});

	test('requires name and kind', async ({ request }) => {
		const res = await request.post('/api/agents', { data: {} });
		expect(res.status()).toBe(422);
		expect((await res.json()).invalid.map((i: { field: string }) => i.field)).toEqual([
			'name',
			'kind'
		]);
	});

	test('rejects a kind outside the enum', async ({ request }) => {
		const res = await request.post('/api/agents', {
			data: { name: unique('Bad'), kind: 'wizard' }
		});
		expect(res.status()).toBe(422);
	});
});

test.describe('PATCH /api/agents/:id', () => {
	test('replaces skills wholesale rather than merging', async ({ request }) => {
		const agent = await create(request, { skills: ['eval-harness'] });
		const { agent: updated } = await (
			await request.patch(`/api/agents/${agent.id}`, { data: { skills: ['paper-reader'] } })
		).json();

		expect(updated.skills).toEqual(['paper-reader']);
	});

	test('clears skills when given an empty array', async ({ request }) => {
		const agent = await create(request, { skills: ['eval-harness'] });
		const { agent: updated } = await (
			await request.patch(`/api/agents/${agent.id}`, { data: { skills: [] } })
		).json();

		expect(updated.skills).toEqual([]);
	});

	test('attaching a skill shows up in that skill usedBy', async ({ request }) => {
		const agent = await create(request, { name: unique('Joiner'), skills: ['paper-reader'] });
		const { skill } = await (await request.get('/api/skills/paper-reader')).json();
		expect(skill.usedBy).toContain(agent.name);
	});

	test('updates scalar fields', async ({ request }) => {
		const agent = await create(request);
		const { agent: updated } = await (
			await request.patch(`/api/agents/${agent.id}`, {
				data: { status: 'busy', statusLabel: 'Running', role: 'Critic' }
			})
		).json();

		expect(updated).toMatchObject({ status: 'busy', statusLabel: 'Running', role: 'Critic' });
	});

	test('rejects an empty patch', async ({ request }) => {
		const agent = await create(request);
		expect((await request.patch(`/api/agents/${agent.id}`, { data: {} })).status()).toBe(400);
	});

	test('404s for an unknown id', async ({ request }) => {
		expect((await request.patch('/api/agents/nope', { data: { role: 'x' } })).status()).toBe(404);
	});
});

test.describe('DELETE /api/agents/:id', () => {
	test('deletes an agent that authors nothing', async ({ request }) => {
		const agent = await create(request);
		expect((await request.delete(`/api/agents/${agent.id}`)).status()).toBe(204);
		expect((await request.get(`/api/agents/${agent.id}`)).status()).toBe(404);
	});

	test('refuses with 409 when the agent still authors a document', async ({ request }) => {
		const agent = await create(request);
		await request.post('/api/documents', {
			data: { name: `held-${Date.now()}.md`, threadId: 'retrieval-eval', authorId: agent.id }
		});

		const res = await request.delete(`/api/agents/${agent.id}`);
		expect(res.status()).toBe(409);
		expect((await res.json()).message).toContain('still authors');
	});

	test('refuses with 409 when the agent still authors a skill', async ({ request }) => {
		const agent = await create(request);
		await request.post('/api/skills', {
			data: { name: `held-skill-${Date.now()}`, authorId: agent.id, authoredBy: 'agent' }
		});

		expect((await request.delete(`/api/agents/${agent.id}`)).status()).toBe(409);
	});

	test('404s for an unknown id', async ({ request }) => {
		expect((await request.delete('/api/agents/nope')).status()).toBe(404);
	});
});
