import { describe, expect, it } from 'vitest';
import { documentDto, skillDto } from '../../src/lib/server/serialize';

/**
 * These guard the compatibility contract: the DB dropped the fixtures'
 * denormalized presentation fields, and the components still expect them.
 */

const author = { id: 'wren', name: 'Wren', initials: 'W', color: '#e8785d' };
const now = new Date();

const skillRow = {
	id: 'paper-reader',
	name: 'paper-reader',
	version: 4,
	description: 'Reads a paper.',
	authoredBy: 'agent' as const,
	body: '# paper-reader',
	uses: 7,
	updatedAt: now,
	createdAt: now
};

describe('skillDto', () => {
	it('renders the integer version as the fixture v-string, keeping the number too', () => {
		const dto = skillDto(skillRow, author, []);
		expect(dto.version).toBe('v4');
		expect(dto.versionNumber).toBe(4);
	});

	it('expands the author FK into the fields components read', () => {
		const dto = skillDto(skillRow, author, []);
		expect(dto).toMatchObject({
			author: 'Wren',
			authorId: 'wren',
			authorInitials: 'W',
			authorColor: '#e8785d'
		});
	});

	it('degrades safely when the author row is missing', () => {
		const dto = skillDto(skillRow, null, []);
		expect(dto).toMatchObject({ author: 'Unknown', authorInitials: '?', authorId: null });
	});

	it('passes usedBy through from the join', () => {
		expect(skillDto(skillRow, author, ['Kestrel']).usedBy).toEqual(['Kestrel']);
	});

	it('emits an ISO timestamp alongside the display string', () => {
		const dto = skillDto(skillRow, author, []);
		expect(dto.updated).toBe('just now');
		expect(dto.updatedAt).toBe(now.toISOString());
	});
});

const docRow = {
	id: 'eval-protocol',
	name: 'eval-protocol.md',
	threadId: 'retrieval-eval',
	version: 2,
	body: 'x'.repeat(1536),
	updatedAt: now,
	createdAt: now
};

describe('documentDto', () => {
	it('derives size from the body rather than storing it', () => {
		expect(documentDto(docRow, author, 'Retrieval eval design').size).toBe('1.5 KB');
	});

	it('joins the thread name back in', () => {
		expect(documentDto(docRow, author, 'Retrieval eval design').threadName).toBe(
			'Retrieval eval design'
		);
	});

	it('degrades safely when the thread name is missing', () => {
		expect(documentDto(docRow, author, null).threadName).toBe('Unknown thread');
	});
});
