import { byteSize, relativeTime } from './api';

/**
 * The database normalized away the fixtures' denormalized presentation fields —
 * `authorInitials`, `authorColor`, `threadName`, `size`, `updated`. These
 * rebuild them on read so API responses stay drop-in compatible with the
 * components, which still expect the fixture shape.
 */

type AgentRow = {
	id: string;
	name: string;
	initials: string;
	color: string;
	kind: 'orchestrator' | 'research' | 'spawned' | 'you';
	role: string;
	description: string;
	status: 'idle' | 'busy' | 'done';
	statusLabel: string;
	instances: number;
	spawnedBy: string | null;
};

export const agentDto = (row: AgentRow, skills: string[], stats: Stat[]) => ({
	id: row.id,
	name: row.name,
	initials: row.initials,
	role: row.role,
	color: row.color,
	kind: row.kind,
	status: row.status,
	statusLabel: row.statusLabel,
	description: row.description,
	instances: row.instances,
	spawnedBy: row.spawnedBy,
	skills,
	stats
});

export type Stat = { value: string; label: string };

type SkillRow = {
	id: string;
	name: string;
	version: number;
	description: string;
	authoredBy: 'you' | 'agent';
	body: string;
	uses: number;
	updatedAt: Date;
	createdAt: Date;
};

type Author = { id: string; name: string; initials: string; color: string } | null;

export const skillDto = (row: SkillRow, author: Author, usedBy: string[]) => ({
	id: row.id,
	name: row.name,
	/** Stored as an int, displayed as `v4`. */
	version: `v${row.version}`,
	versionNumber: row.version,
	description: row.description,
	author: author?.name ?? 'Unknown',
	authorId: author?.id ?? null,
	authorInitials: author?.initials ?? '?',
	authorColor: author?.color ?? '#5b5b66',
	authoredBy: row.authoredBy,
	updated: relativeTime(row.updatedAt),
	updatedAt: row.updatedAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	uses: row.uses,
	usedBy,
	body: row.body
});

type DocRow = {
	id: string;
	name: string;
	threadId: string;
	version: number;
	body: string;
	updatedAt: Date;
	createdAt: Date;
};

export const documentDto = (row: DocRow, author: Author, threadName: string | null) => ({
	id: row.id,
	name: row.name,
	threadId: row.threadId,
	threadName: threadName ?? 'Unknown thread',
	author: author?.name ?? 'Unknown',
	authorId: author?.id ?? null,
	authorInitials: author?.initials ?? '?',
	authorColor: author?.color ?? '#5b5b66',
	updated: relativeTime(row.updatedAt),
	updatedAt: row.updatedAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	version: `v${row.version}`,
	versionNumber: row.version,
	/** Derived from the body rather than stored, unlike the fixture. */
	size: byteSize(row.body),
	body: row.body
});
