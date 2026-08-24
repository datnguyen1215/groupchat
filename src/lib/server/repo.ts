import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { agentSkills, agents, documents, entries, skills, threads } from './db/schema';
import { agentDto, documentDto, skillDto, type Stat } from './serialize';
import { slugify } from './api';

/**
 * Read helpers shared by the routes. Each returns the frontend-facing DTO, so a
 * route handler is validation plus one call.
 */

/** Agent identity for the `author` columns, fetched once and indexed by id. */
const authorIndex = async (ids: string[]) => {
	const unique = [...new Set(ids)];
	if (!unique.length) return new Map<string, (typeof rows)[number]>();
	const rows = await db
		.select({
			id: agents.id,
			name: agents.name,
			initials: agents.initials,
			color: agents.color
		})
		.from(agents)
		.where(inArray(agents.id, unique));
	return new Map(rows.map((r) => [r.id, r]));
};

/** skillId -> agent names, the join that replaced the fixture's `usedBy` column. */
const usedByIndex = async (skillIds: string[]) => {
	const index = new Map<string, string[]>();
	if (!skillIds.length) return index;
	const rows = await db
		.select({ skillId: agentSkills.skillId, name: agents.name })
		.from(agentSkills)
		.innerJoin(agents, eq(agents.id, agentSkills.agentId))
		.where(inArray(agentSkills.skillId, skillIds))
		.orderBy(asc(agents.name));
	for (const r of rows) index.set(r.skillId, [...(index.get(r.skillId) ?? []), r.name]);
	return index;
};

export const listSkills = async () => {
	const rows = await db.select().from(skills).orderBy(asc(skills.name));
	const [authors, usedBy] = await Promise.all([
		authorIndex(rows.map((r) => r.authorId)),
		usedByIndex(rows.map((r) => r.id))
	]);
	return rows.map((r) => skillDto(r, authors.get(r.authorId) ?? null, usedBy.get(r.id) ?? []));
};

export const getSkill = async (id: string) => {
	const [row] = await db.select().from(skills).where(eq(skills.id, id));
	if (!row) return null;
	const [authors, usedBy] = await Promise.all([authorIndex([row.authorId]), usedByIndex([row.id])]);
	return skillDto(row, authors.get(row.authorId) ?? null, usedBy.get(row.id) ?? []);
};

export const listDocuments = async (threadId?: string) => {
	const rows = await db
		.select()
		.from(documents)
		.where(threadId ? eq(documents.threadId, threadId) : undefined)
		.orderBy(asc(documents.name));
	const authors = await authorIndex(rows.map((r) => r.authorId));
	const threadNames = await threadNameIndex(rows.map((r) => r.threadId));
	return rows.map((r) =>
		documentDto(r, authors.get(r.authorId) ?? null, threadNames.get(r.threadId) ?? null)
	);
};

export const getDocument = async (id: string) => {
	const [row] = await db.select().from(documents).where(eq(documents.id, id));
	if (!row) return null;
	const [authors, threadNames] = await Promise.all([
		authorIndex([row.authorId]),
		threadNameIndex([row.threadId])
	]);
	return documentDto(row, authors.get(row.authorId) ?? null, threadNames.get(row.threadId) ?? null);
};

const threadNameIndex = async (ids: string[]) => {
	const unique = [...new Set(ids)];
	const index = new Map<string, string>();
	if (!unique.length) return index;
	const rows = await db
		.select({ id: threads.id, name: threads.name })
		.from(threads)
		.where(inArray(threads.id, unique));
	for (const r of rows) index.set(r.id, r.name);
	return index;
};

/**
 * Stats were fixture literals (`'89 messages'`). Counted for real where the data
 * supports it; the ephemeral agents' `wall clock` had no source and is dropped.
 */
const statsIndex = async (ids: string[]) => {
	const index = new Map<string, Stat[]>();
	if (!ids.length) return index;

	const [messages, docs] = await Promise.all([
		db
			.select({ id: entries.authorId, n: sql<number>`count(*)::int` })
			.from(entries)
			.where(and(inArray(entries.authorId, ids), eq(entries.kind, 'message')))
			.groupBy(entries.authorId),
		db
			.select({ id: documents.authorId, n: sql<number>`count(*)::int` })
			.from(documents)
			.where(inArray(documents.authorId, ids))
			.groupBy(documents.authorId)
	]);

	const byId = (rows: { id: string | null; n: number }[]) =>
		new Map(rows.filter((r) => r.id).map((r) => [r.id as string, r.n]));
	const m = byId(messages);
	const d = byId(docs);

	for (const id of ids)
		index.set(id, [
			{ value: String(m.get(id) ?? 0), label: 'messages' },
			{ value: String(d.get(id) ?? 0), label: 'docs' }
		]);
	return index;
};

const agentSkillIndex = async (ids: string[]) => {
	const index = new Map<string, string[]>();
	if (!ids.length) return index;
	const rows = await db
		.select({ agentId: agentSkills.agentId, skillId: agentSkills.skillId })
		.from(agentSkills)
		.where(inArray(agentSkills.agentId, ids))
		.orderBy(asc(agentSkills.skillId));
	for (const r of rows) index.set(r.agentId, [...(index.get(r.agentId) ?? []), r.skillId]);
	return index;
};

const decorate = async (rows: (typeof agents.$inferSelect)[]) => {
	const ids = rows.map((r) => r.id);
	const [skillsBy, stats] = await Promise.all([agentSkillIndex(ids), statsIndex(ids)]);
	return rows.map((r) => agentDto(r, skillsBy.get(r.id) ?? [], stats.get(r.id) ?? []));
};

export const listAgents = async (kind?: 'orchestrator' | 'research' | 'spawned' | 'you') => {
	const rows = await db
		.select()
		.from(agents)
		.where(kind ? eq(agents.kind, kind) : undefined)
		.orderBy(asc(agents.name));
	return decorate(rows);
};

export const getAgent = async (id: string) => {
	const [row] = await db.select().from(agents).where(eq(agents.id, id));
	if (!row) return null;
	const [dto] = await decorate([row]);
	return dto;
};

/** Replaces an agent's skill set wholesale. Callers validate the ids exist first. */
export const setAgentSkills = async (agentId: string, skillIds: string[]) => {
	await db.delete(agentSkills).where(eq(agentSkills.agentId, agentId));
	if (skillIds.length)
		await db.insert(agentSkills).values(skillIds.map((skillId) => ({ agentId, skillId })));
};

export const existingSkillIds = async (ids: string[]) => {
	if (!ids.length) return new Set<string>();
	const rows = await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, ids));
	return new Set(rows.map((r) => r.id));
};

export const threadExists = async (id: string) => {
	const [row] = await db.select({ id: threads.id }).from(threads).where(eq(threads.id, id));
	return Boolean(row);
};

export const agentExists = async (id: string) => {
	const [row] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, id));
	return Boolean(row);
};

/** Slug from the name, suffixed until it does not collide. */
export const uniqueId = async (
	table: typeof skills | typeof documents | typeof agents,
	name: string
) => {
	const base = slugify(name);
	const rows = await db
		.select({ id: table.id })
		.from(table)
		.where(sql`${table.id} = ${base} or ${table.id} like ${base + '-%'}`);
	const taken = new Set(rows.map((r) => r.id));
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
};
