import type { Sql } from 'postgres';

/**
 * A small, fixed baseline every test can read. Tests that mutate create their
 * own uniquely-named rows instead of editing these, so the suite is safe to run
 * in parallel against one schema.
 */
export const BASE = {
	agents: [
		{ id: 'orchestrator', name: 'Orchestrator', initials: 'O', color: '#7aa2ff', kind: 'orchestrator' },
		{ id: 'kestrel', name: 'Kestrel', initials: 'K', color: '#4ec98a', kind: 'research' },
		{ id: 'wren', name: 'Wren', initials: 'W', color: '#e8785d', kind: 'research' },
		{ id: 'you', name: 'You', initials: 'DN', color: '#5b5b66', kind: 'you' }
	],
	threads: [
		{ id: 'retrieval-eval', name: 'Retrieval eval design' },
		{ id: 'ablation-context', name: 'Ablation: context window' }
	],
	skills: [
		{
			id: 'eval-harness',
			name: 'eval-harness',
			version: 4,
			description: 'Runs a metric sweep over a corpus.',
			authorId: 'you',
			authoredBy: 'you',
			uses: 12,
			body: '# eval-harness'
		},
		{
			id: 'paper-reader',
			name: 'paper-reader',
			version: 2,
			description: 'Reads one paper and extracts claims.',
			authorId: 'wren',
			authoredBy: 'agent',
			uses: 3,
			body: '# paper-reader'
		}
	],
	documents: [
		{
			id: 'eval-protocol',
			name: 'eval-protocol.md',
			threadId: 'retrieval-eval',
			authorId: 'kestrel',
			version: 1,
			body: '# Protocol\n\nSome body text.'
		}
	],
	/** Kestrel uses eval-harness; drives the `usedBy` join assertions. */
	agentSkills: [{ agentId: 'kestrel', skillId: 'eval-harness' }]
};

export const seedBase = async (sql: Sql) => {
	await sql`truncate table steps, entries, agent_skills, documents, skills, threads, agents restart identity cascade`;

	for (const a of BASE.agents)
		await sql`insert into agents ${sql({ ...a, role: '', description: '', status: 'idle', status_label: 'Idle' } as never)}`;

	for (const t of BASE.threads) await sql`insert into threads ${sql(t as never)}`;

	for (const s of BASE.skills)
		await sql`insert into skills ${sql({
			id: s.id,
			name: s.name,
			version: s.version,
			description: s.description,
			author_id: s.authorId,
			authored_by: s.authoredBy,
			uses: s.uses,
			body: s.body
		} as never)}`;

	for (const d of BASE.documents)
		await sql`insert into documents ${sql({
			id: d.id,
			name: d.name,
			thread_id: d.threadId,
			author_id: d.authorId,
			version: d.version,
			body: d.body
		} as never)}`;

	for (const j of BASE.agentSkills)
		await sql`insert into agent_skills ${sql({ agent_id: j.agentId, skill_id: j.skillId } as never)}`;
};
