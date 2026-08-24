/**
 * Seeds the cast and an empty thread. Idempotent: truncates, then re-inserts.
 *
 * There is no conversation here on purpose. Messages are what the agents
 * produce; seeding them would make it impossible to tell a real turn from a
 * fixture. The one thing that does matter is the agents' roles — the loop
 * feeds `role` and `description` straight into each agent's system prompt, so
 * conflicting mandates are what make them argue instead of agree.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as s from '../src/lib/server/db/schema';
import { databaseUrl } from '../src/lib/server/db/url';

import { SEED_THREADS } from '../src/lib/server/db/seed-ids';

const client = postgres(databaseUrl(process.env.DATABASE_URL));
const db = drizzle(client, { schema: s });

const agents = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    initials: 'O',
    color: '#7aa2ff',
    kind: 'orchestrator' as const,
    role: 'orch',
    description:
      'Decomposes the ask, assigns agents, and decides when a thread is done. Never answers directly.'
  },
  {
    id: 'kestrel',
    name: 'Kestrel',
    initials: 'K',
    color: '#4ec98a',
    kind: 'research' as const,
    role: 'analyst',
    description:
      'You design measurements and read results honestly. You push back when a number cannot support the claim being made.'
  },
  {
    id: 'wren',
    name: 'Wren',
    initials: 'W',
    color: '#e8785d',
    kind: 'research' as const,
    role: 'researcher',
    description:
      'You find and summarise prior art. You say plainly when the evidence is thin rather than filling the gap with plausible sentences.'
  },
  {
    id: 'finch',
    name: 'Finch',
    initials: 'F',
    color: '#b47aff',
    kind: 'research' as const,
    role: 'critic',
    description:
      'You argue the other side. You look for the assumption nobody stated and the cost nobody costed. Agreeing is not your job.'
  },
  {
    id: 'you',
    name: 'You',
    initials: 'DN',
    color: '#5b5b66',
    kind: 'you' as const,
    role: '',
    description: ''
  }
];

const skills = [
  {
    id: 'eval-harness',
    name: 'eval-harness',
    description: 'How to structure a retrieval evaluation so the numbers mean something.',
    authorId: 'kestrel',
    authoredBy: 'agent' as const,
    body: '# eval-harness\n\nPick metrics before you see results. Report recall@k and MRR together — recall alone hides ranking quality.\n\nHold the token budget fixed across arms, or the comparison measures budget, not the change.'
  },
  {
    id: 'paper-reader',
    name: 'paper-reader',
    description: 'Read a paper for the claim, the evidence, and the gap between them.',
    authorId: 'wren',
    authoredBy: 'agent' as const,
    body: '# paper-reader\n\nState the claim in one sentence. Then the evidence offered. Then what the evidence does not cover.\n\nA reported speedup that is not wall-clock is not a speedup.'
  },
  {
    id: 'relevance-judge',
    name: 'relevance-judge',
    description: 'Rubric for grading retrieval relevance with an LLM judge.',
    authorId: 'finch',
    authoredBy: 'agent' as const,
    body: '# relevance-judge\n\nGrade 0-3: irrelevant, tangential, partial, fully answers.\n\nSpot-check ten percent by hand. An unchecked judge drifts and you will not notice.'
  }
];

const main = async () => {
  await db.execute(
    sql`truncate table ${s.steps}, ${s.entries}, ${s.agentSkills}, ${s.documents}, ${s.skills}, ${s.threads}, ${s.agents} restart identity cascade`
  );

  await db
    .insert(s.agents)
    .values(
      agents.map(a => ({ ...a, status: 'idle' as const, statusLabel: 'Idle', instances: 1 }))
    );

  /**
   * Thread ids are UUIDs in production. The seed pins two fixed ones so the
   * e2e suite can address a known thread without querying for it first.
   */
  await db.insert(s.threads).values([
    {
      id: SEED_THREADS.retrievalEval,
      name: 'Retrieval eval design',
      group: 'Active' as const,
      live: true
    },
    {
      id: SEED_THREADS.ablationContext,
      name: 'Ablation: context window',
      group: 'Active' as const,
      live: false
    }
  ]);

  await db.insert(s.skills).values(skills);

  await db.insert(s.agentSkills).values([
    { agentId: 'kestrel', skillId: 'eval-harness' },
    { agentId: 'wren', skillId: 'paper-reader' },
    { agentId: 'finch', skillId: 'relevance-judge' }
  ]);

  const counts = await db.execute(sql`
		select 'agents' as name, count(*)::int as n from agents
		union all select 'threads', count(*)::int from threads
		union all select 'skills', count(*)::int from skills
		union all select 'entries', count(*)::int from entries
	`);
  console.table([...counts]);
  await client.end();
};

main();
