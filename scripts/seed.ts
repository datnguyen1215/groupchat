/**
 * One-shot migration of the `src/lib/data/` fixtures into Postgres.
 * Idempotent: truncates every table, then re-inserts. Safe to re-run.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as s from '../src/lib/server/db/schema';
import { orchestrator, researchAgents, spawnedAgents, you } from '../src/lib/data/agents';
import { skills as skillFixtures } from '../src/lib/data/skills';
import { documents as docFixtures } from '../src/lib/data/documents';
import { threads as threadFixtures } from '../src/lib/data/threads';
import { databaseUrl } from '../src/lib/server/db/url';

const client = postgres(databaseUrl(process.env.DATABASE_URL));
const db = drizzle(client, { schema: s });

/** Fixtures reference agents by display name; the DB references them by id. */
const idByName = new Map<string, string>();

/** `'Yesterday'`, `'Mon'`, `'just now'` — relative strings with no anchor. Seeded as offsets from now. */
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

const parseVersion = (v: string) => Number(v.replace(/^v/, '')) || 1;

const durationToMs = (d: string): number | null => {
  const m = /^([\d.]+)\s*(ms|s|m)$/.exec(d.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(m[2] === 'ms' ? n : m[2] === 's' ? n * 1000 : n * 60_000);
};

const main = async () => {
  await db.execute(
    sql`truncate table ${s.steps}, ${s.entries}, ${s.agentSkills}, ${s.documents}, ${s.skills}, ${s.threads}, ${s.agents} restart identity cascade`
  );

  const agentRows = [
    { ...orchestrator, kind: 'orchestrator' as const },
    ...researchAgents.map(a => ({ ...a, kind: 'research' as const })),
    ...spawnedAgents.map(a => ({ ...a, kind: 'spawned' as const })),
    {
      ...you,
      kind: 'you' as const,
      role: '',
      description: '',
      status: 'idle' as const,
      statusLabel: 'Idle',
      skills: [] as string[]
    }
  ];

  await db.insert(s.agents).values(
    agentRows.map(a => {
      idByName.set(a.name, a.id);
      const multiplied = /×(\d+)\s*$/.exec(a.name);
      return {
        id: a.id,
        name: a.name,
        initials: a.initials,
        color: a.color,
        kind: a.kind,
        role: a.role,
        description: a.description,
        status: a.status,
        statusLabel: a.statusLabel,
        instances: multiplied ? Number(multiplied[1]) : 1,
        spawnedBy: /spawned by (\w+)/i.exec(a.role)?.[1] ?? null
      };
    })
  );

  await db.insert(s.threads).values(
    threadFixtures.map(t => ({
      id: t.id,
      name: t.name,
      group: t.group,
      live: t.live,
      unread: t.unread ?? 0
    }))
  );

  await db.insert(s.skills).values(
    skillFixtures.map(sk => ({
      id: sk.id,
      name: sk.name,
      version: parseVersion(sk.version),
      description: sk.description,
      authorId: idByName.get(sk.author) ?? you.id,
      authoredBy: sk.authoredBy,
      body: sk.body,
      uses: sk.uses
    }))
  );

  await db.insert(s.documents).values(
    docFixtures.map(d => ({
      id: d.id,
      name: d.name,
      threadId: d.threadId,
      authorId: idByName.get(d.author) ?? you.id,
      version: parseVersion(d.version),
      body: d.body,
      updatedAt: ago(d.updated === 'just now' ? 0 : d.updated === 'Yesterday' ? 1 : 3)
    }))
  );

  /**
   * The join replaces both the skill's `usedBy` and the agent's `skills` array —
   * the two fixture fields that could disagree. Union them, drop `'+2'` placeholders.
   */
  const pairs = new Set<string>();
  for (const sk of skillFixtures)
    for (const name of sk.usedBy) {
      const agentId = idByName.get(name);
      if (agentId) pairs.add(`${agentId} ${sk.id}`);
    }
  const skillIds = new Set(skillFixtures.map(sk => sk.id));
  for (const a of [orchestrator, ...researchAgents])
    for (const skillId of a.skills) if (skillIds.has(skillId)) pairs.add(`${a.id} ${skillId}`);

  if (pairs.size)
    await db.insert(s.agentSkills).values(
      [...pairs].map(p => {
        const [agentId, skillId] = p.split(' ');
        return { agentId, skillId };
      })
    );

  const docIds = new Set(docFixtures.map(d => d.id));

  for (const t of threadFixtures) {
    if (t.entries.length)
      await db.insert(s.entries).values(
        t.entries.map((e, i) => ({
          id: `${t.id}-${e.id}`,
          threadId: t.id,
          kind: e.kind,
          seq: i,
          authorId: e.kind === 'message' ? (idByName.get(e.author) ?? null) : null,
          tag: e.kind === 'message' ? (e.tag ?? null) : null,
          paragraphs: e.kind === 'message' ? e.paragraphs : [],
          docId: e.kind === 'message' && e.docId && docIds.has(e.docId) ? e.docId : null,
          label: e.kind === 'activity' ? e.label : null,
          bars: e.kind === 'activity' ? e.bars : []
        }))
      );

    const stepRows = t.activity.flatMap(group =>
      group.steps.map((step, i) => ({
        id: `${t.id}-${step.id}`,
        threadId: t.id,
        groupLabel: group.label,
        seq: i,
        state: step.state,
        name: step.name,
        detail: step.detail,
        durationMs: durationToMs(step.duration),
        parentId: null as string | null,
        badge: step.badge ?? null
      }))
    );

    /** `child: true` is an indent flag; the DB stores the real parent — the nearest preceding non-child. */
    let lastParent: string | null = null;
    let cursor = 0;
    for (const group of t.activity)
      for (const step of group.steps) {
        const row = stepRows[cursor++];
        if (step.child) row.parentId = lastParent;
        else lastParent = row.id;
      }

    if (stepRows.length) await db.insert(s.steps).values(stepRows);
  }

  const counts = await db.execute(sql`
		select 'agents' as name, count(*)::int as n from agents
		union all select 'threads', count(*)::int from threads
		union all select 'skills', count(*)::int from skills
		union all select 'documents', count(*)::int from documents
		union all select 'agent_skills', count(*)::int from agent_skills
		union all select 'entries', count(*)::int from entries
		union all select 'steps', count(*)::int from steps
	`);
  console.table([...counts]);
  await client.end();
};

main();
