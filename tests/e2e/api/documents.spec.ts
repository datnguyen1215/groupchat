import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const unique = (label: string) => `${label}-${test.info().parallelIndex}-${Date.now()}.md`;

const create = async (request: APIRequestContext, overrides: Record<string, unknown> = {}) => {
	const res = await request.post('/api/documents', {
		data: {
			name: unique('doc'),
			threadId: 'retrieval-eval',
			authorId: 'kestrel',
			body: '# Doc\n\nbody',
			...overrides
		}
	});
	return (await res.json()).document;
};

test.describe('GET /api/documents', () => {
	test('expands the author FK and joins the thread name', async ({ request }) => {
		const { documents } = await (await request.get('/api/documents')).json();
		const doc = documents.find((d: { id: string }) => d.id === 'eval-protocol');

		expect(doc).toMatchObject({
			name: 'eval-protocol.md',
			threadName: 'Retrieval eval design',
			author: 'Kestrel',
			authorInitials: 'K',
			authorColor: '#4ec98a',
			version: 'v1'
		});
	});

	test('derives size from the body rather than storing it', async ({ request }) => {
		const doc = await create(request, { body: 'x'.repeat(2048) });
		const { documents } = await (await request.get('/api/documents')).json();
		expect(documents.find((d: { id: string }) => d.id === doc.id).size).toBe('2.0 KB');
	});

	test('filters by threadId', async ({ request }) => {
		const { documents } = await (
			await request.get('/api/documents?threadId=retrieval-eval')
		).json();
		expect(documents.length).toBeGreaterThan(0);
		expect(documents.every((d: { threadId: string }) => d.threadId === 'retrieval-eval')).toBe(true);
	});

	test('returns an empty list for a thread with no documents', async ({ request }) => {
		const res = await request.get('/api/documents?threadId=ablation-context');
		expect(res.status()).toBe(200);
		expect((await res.json()).documents).toEqual([]);
	});
});

test.describe('POST /api/documents', () => {
	test('creates at version 1', async ({ request }) => {
		const doc = await create(request);
		expect(doc).toMatchObject({ version: 'v1', author: 'Kestrel', threadId: 'retrieval-eval' });
	});

	test('reports an unknown thread and author together', async ({ request }) => {
		const res = await request.post('/api/documents', {
			data: { name: 'x.md', threadId: 'ghost', authorId: 'ghost' }
		});
		expect(res.status()).toBe(422);

		const { invalid } = await res.json();
		expect(invalid).toEqual([
			{ field: 'threadId', message: 'no such thread' },
			{ field: 'authorId', message: 'no such agent' }
		]);
	});

	test('requires name, threadId and authorId', async ({ request }) => {
		const res = await request.post('/api/documents', { data: {} });
		expect(res.status()).toBe(422);
		expect((await res.json()).invalid.map((i: { field: string }) => i.field)).toEqual([
			'name',
			'threadId',
			'authorId'
		]);
	});
});

test.describe('PATCH /api/documents/:id', () => {
	test('bumps the version and recomputes size when the body changes', async ({ request }) => {
		const doc = await create(request, { body: 'short' });
		const { document } = await (
			await request.patch(`/api/documents/${doc.id}`, { data: { body: 'x'.repeat(1024) } })
		).json();

		expect(document.version).toBe('v2');
		expect(document.size).toBe('1.0 KB');
	});

	test('moves a document between threads without bumping the version', async ({ request }) => {
		const doc = await create(request);
		const { document } = await (
			await request.patch(`/api/documents/${doc.id}`, { data: { threadId: 'ablation-context' } })
		).json();

		expect(document.threadName).toBe('Ablation: context window');
		expect(document.version).toBe('v1');
	});

	test('rejects a move to a thread that does not exist', async ({ request }) => {
		const doc = await create(request);
		const res = await request.patch(`/api/documents/${doc.id}`, { data: { threadId: 'ghost' } });

		expect(res.status()).toBe(422);
		expect((await res.json()).invalid[0].field).toBe('threadId');
	});

	test('404s for an unknown id', async ({ request }) => {
		expect((await request.patch('/api/documents/nope', { data: { body: 'x' } })).status()).toBe(404);
	});
});

test.describe('DELETE /api/documents/:id', () => {
	test('removes the document', async ({ request }) => {
		const doc = await create(request);
		expect((await request.delete(`/api/documents/${doc.id}`)).status()).toBe(204);
		expect((await request.get(`/api/documents/${doc.id}`)).status()).toBe(404);
	});

	test('404s for an unknown id', async ({ request }) => {
		expect((await request.delete('/api/documents/nope')).status()).toBe(404);
	});
});
