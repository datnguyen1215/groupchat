import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { db } from './db';
import { agentSkills, agents, documents, entries, skills, steps, threads } from './db/schema';
import { agentDto, documentDto, skillDto, type Stat } from './serialize';
import { relativeTime, slugify } from './api';
import { publish } from './events/bus';
import { logger } from './logger';
import { groupSteps } from './steps';

/**
 * Writes log at `info`; reads do not. A read is already accounted for by the
 * request line in `hooks.server.ts`, but a write is the thing you work
 * backwards from when the data is wrong.
 */
const log = logger('repo');

/**
 * The status label an agent carries while parked inside `run_agent`, waiting on
 * the workers it delegated to. It still holds a `busy` row — the turn is not
 * over and `clearStaleBusy` must still be able to reach it — but it is not
 * doing anything a presence row can usefully report, so `listBusyAgents` skips
 * it. Exported because `loop.ts` sets it and this is the only definition.
 */
export const BLOCKED = 'Delegating';

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
  return new Map(rows.map(r => [r.id, r]));
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
    authorIndex(rows.map(r => r.authorId)),
    usedByIndex(rows.map(r => r.id))
  ]);
  return rows.map(r => skillDto(r, authors.get(r.authorId) ?? null, usedBy.get(r.id) ?? []));
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
  const authors = await authorIndex(rows.map(r => r.authorId));
  const threadNames = await threadNameIndex(rows.map(r => r.threadId));
  return rows.map(r =>
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
 * supports it: `messages` and `docs` are queried, `instances` is a column on
 * spawned agents. The fixtures' `tool calls` and `wall clock` had no backing
 * table and are dropped.
 */
const statsIndex = async (rows: (typeof agents.$inferSelect)[]) => {
  const index = new Map<string, Stat[]>();
  const ids = rows.map(r => r.id);
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
    new Map(rows.filter(r => r.id).map(r => [r.id as string, r.n]));
  const m = byId(messages);
  const d = byId(docs);

  for (const row of rows)
    index.set(row.id, [
      { value: String(m.get(row.id) ?? 0), label: 'messages' },
      { value: String(d.get(row.id) ?? 0), label: 'docs' },
      /* Spawned agents run in parallel; the count is the point of the card. */
      ...(row.kind === 'spawned' ? [{ value: String(row.instances), label: 'instances' }] : [])
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
  const ids = rows.map(r => r.id);
  const [skillsBy, stats] = await Promise.all([agentSkillIndex(ids), statsIndex(rows)]);
  return rows.map(r => agentDto(r, skillsBy.get(r.id) ?? [], stats.get(r.id) ?? []));
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
    await db.insert(agentSkills).values(skillIds.map(skillId => ({ agentId, skillId })));
  log.info({ agentId, skillIds }, 'agent skills set');
};

export const existingSkillIds = async (ids: string[]) => {
  if (!ids.length) return new Set<string>();
  const rows = await db.select({ id: skills.id }).from(skills).where(inArray(skills.id, ids));
  return new Set(rows.map(r => r.id));
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
  const taken = new Set(rows.map(r => r.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
};

/* ---------------------------------------------------------------------------
 * Threads, entries, steps.
 *
 * Entries are append-only: an agent turn inserts rows, it never updates them.
 * That is what keeps a message from being replaced by the next one. Work in
 * progress lives in `steps` instead, and the UI reads it as a presence row.
 * ------------------------------------------------------------------------- */

/**
 * Most recently active first — a chat list is ordered by what just happened,
 * not alphabetically. `preview` is the last thing said, the way the sidebar
 * shows it.
 */
export const listThreads = async () => {
  const rows = await db.select().from(threads).orderBy(desc(threads.updatedAt));

  const latest = await db
    .selectDistinctOn([entries.threadId], {
      threadId: entries.threadId,
      paragraphs: entries.paragraphs,
      authorId: entries.authorId
    })
    .from(entries)
    .where(eq(entries.kind, 'message'))
    .orderBy(desc(entries.threadId), desc(entries.seq));

  const authors = await authorIndex(latest.map(r => r.authorId).filter((id): id is string => !!id));
  const previews = new Map(
    latest.map(r => {
      const name = r.authorId ? (authors.get(r.authorId)?.name ?? '') : '';
      return [r.threadId, `${name}: ${r.paragraphs[0] ?? ''}`];
    })
  );

  return rows.map(r => ({ ...r, preview: previews.get(r.id) ?? 'No messages yet' }));
};

/**
 * New threads start untitled; the user renames them from the sidebar or header.
 * The id is a UUID rather than a slug of the name — a slug would have to be
 * uniquified against the table on every insert, and renaming a thread would
 * leave its URL pointing at the old title.
 */
export const createThread = async (name: string) => {
  const id = randomUUID();
  await db.insert(threads).values({ id, name, group: 'Active' });
  log.info({ id, threadName: name }, 'thread created');
  publish({ scope: 'threads' });
  return id;
};

export const renameThread = async (id: string, name: string) => {
  await db.update(threads).set({ name, updatedAt: new Date() }).where(eq(threads.id, id));
  log.info({ id, threadName: name }, 'thread renamed');
  publish({ scope: 'threads' });
  publish({ scope: 'thread', threadId: id });
};

/** Cascades take care of the thread's documents, entries and steps. */
export const deleteThread = async (id: string) => {
  await db.delete(threads).where(eq(threads.id, id));
  log.info({ id }, 'thread deleted');
  publish({ scope: 'threads' });
  /** Anyone still viewing it needs to find out the thread is gone. */
  publish({ scope: 'thread', threadId: id });
};

export const getThread = async (id: string) => {
  const [row] = await db.select().from(threads).where(eq(threads.id, id));
  return row ?? null;
};

/** The message stream, oldest first. `seq` is the only ordering key. */
export const listEntries = async (threadId: string) => {
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.threadId, threadId))
    .orderBy(asc(entries.seq));
  const authors = await authorIndex(rows.map(r => r.authorId).filter((id): id is string => !!id));

  return rows.map(r => {
    const author = r.authorId ? authors.get(r.authorId) : null;
    return {
      kind: r.kind,
      id: r.id,
      author: author?.name ?? 'Unknown',
      authorId: r.authorId,
      initials: author?.initials ?? '?',
      color: author?.color ?? '#5b5b66',
      tag: r.tag ?? undefined,
      isOrchestrator: r.tag === 'orch',
      isYou: r.authorId === 'you',
      time: relativeTime(r.createdAt),
      paragraphs: r.paragraphs,
      docId: r.docId ?? undefined,
      label: r.label ?? '',
      bars: r.bars
    };
  });
};

/** Next `seq` for a thread. Callers insert immediately after. */
const nextSeq = async (threadId: string) => {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${entries.seq}), 0)::int` })
    .from(entries)
    .where(eq(entries.threadId, threadId));
  return (row?.max ?? 0) + 1;
};

/** Appends one message. The only way a message enters a thread. */
export const appendMessage = async (input: {
  threadId: string;
  authorId: string;
  paragraphs: string[];
  tag?: string;
  docId?: string;
}) => {
  const seq = await nextSeq(input.threadId);
  const id = randomUUID();
  await db.insert(entries).values({
    id,
    threadId: input.threadId,
    kind: 'message',
    seq,
    authorId: input.authorId,
    tag: input.tag ?? null,
    paragraphs: input.paragraphs,
    docId: input.docId ?? null
  });
  log.info(
    {
      id,
      threadId: input.threadId,
      authorId: input.authorId,
      seq,
      chars: input.paragraphs.join('').length
    },
    'message appended'
  );

  /** Thread order is recency, so a new message has to move the thread. */
  await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, input.threadId));
  /** Both scopes: the entry lands in the thread, and recency reorders the list. */
  publish({ scope: 'thread', threadId: input.threadId });
  publish({ scope: 'threads' });
  return id;
};

/**
 * Appends one failure. Not a message: an error has no author, so it renders
 * without an avatar or a name and cannot be read as an agent choosing to speak.
 *
 * `line` is already-safe wording — see `describe()` in `ai/loop.ts`. Provider
 * text never reaches this function; it goes to the log instead.
 */
export const appendError = async (input: { threadId: string; line: string }) => {
  const seq = await nextSeq(input.threadId);
  const id = randomUUID();
  await db.insert(entries).values({
    id,
    threadId: input.threadId,
    kind: 'error',
    seq,
    label: input.line
  });
  log.info({ id, threadId: input.threadId, line: input.line }, 'error appended');

  /** Same as a message: the thread has new content, so recency reorders it. */
  await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, input.threadId));
  publish({ scope: 'thread', threadId: input.threadId });
  publish({ scope: 'threads' });
  return id;
};

/** The collapsed sparkline that summarises one agent's tool run. */
export const appendActivity = async (input: {
  threadId: string;
  label: string;
  bars: ('ok' | 'run' | 'spawn')[];
}) => {
  const seq = await nextSeq(input.threadId);
  const id = randomUUID();
  await db.insert(entries).values({
    id,
    threadId: input.threadId,
    kind: 'activity',
    seq,
    label: input.label,
    bars: input.bars
  });
  log.info(
    { id, threadId: input.threadId, label: input.label, bars: input.bars.length },
    'activity appended'
  );
  publish({ scope: 'thread', threadId: input.threadId });
  return id;
};

/** The activity drawer's trace, grouped exactly as it is stored. */
export const listSteps = async (threadId: string) => {
  const rows = await db
    .select()
    .from(steps)
    .where(eq(steps.threadId, threadId))
    .orderBy(asc(steps.seq));

  return groupSteps(rows);
};

/** One tool call. Written after the call resolves, so the duration is real. */
export const appendStep = async (input: {
  threadId: string;
  groupLabel: string;
  state: 'ok' | 'run' | 'spawn';
  name: string;
  detail: string;
  durationMs: number | null;
  parentId?: string;
  badge?: string;
}) => {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${steps.seq}), 0)::int` })
    .from(steps)
    .where(eq(steps.threadId, input.threadId));
  const seq = (row?.max ?? 0) + 1;
  const id = randomUUID();
  await db.insert(steps).values({
    id,
    threadId: input.threadId,
    groupLabel: input.groupLabel,
    seq,
    state: input.state,
    name: input.name,
    detail: input.detail,
    durationMs: input.durationMs,
    parentId: input.parentId ?? null,
    badge: input.badge ?? null
  });
  log.info(
    {
      id,
      threadId: input.threadId,
      stepName: input.name,
      state: input.state,
      ms: input.durationMs
    },
    'step appended'
  );
  publish({ scope: 'thread', threadId: input.threadId });
  return id;
};

/**
 * Drives the presence row and the agents page. `busyThreadId` is set alongside
 * the status so a busy agent appears in the thread it is actually working in.
 */
export const setAgentStatus = async (
  agentId: string,
  status: 'idle' | 'busy' | 'done',
  statusLabel: string,
  threadId: string | null = null
) => {
  /**
   * Read before write: going idle passes no thread, but the presence row that
   * has to disappear lives in whichever thread the agent was busy in.
   */
  const [before] = await db
    .select({ busyThreadId: agents.busyThreadId })
    .from(agents)
    .where(eq(agents.id, agentId));

  await db
    .update(agents)
    .set({
      status,
      statusLabel,
      busyThreadId: status === 'busy' ? threadId : null,
      updatedAt: new Date()
    })
    .where(eq(agents.id, agentId));

  log.info({ agentId, status, statusLabel, threadId }, 'agent status');

  for (const id of new Set([threadId, before?.busyThreadId].filter(Boolean) as string[]))
    publish({ scope: 'thread', threadId: id });
};

/**
 * Clears agents left `busy` by a process that died mid-turn. `finally` cannot
 * run if the server is killed, so without this a crash leaves a presence row
 * spinning forever and the only fix is editing the database by hand.
 */
export const clearStaleBusy = async (olderThanMs = 5 * 60_000) => {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .select({ busyThreadId: agents.busyThreadId })
    .from(agents)
    .where(and(eq(agents.status, 'busy'), lt(agents.updatedAt, cutoff)));
  if (!stale.length) return;

  await db
    .update(agents)
    .set({ status: 'idle', statusLabel: 'Idle', busyThreadId: null })
    .where(and(eq(agents.status, 'busy'), lt(agents.updatedAt, cutoff)));

  /** Warn, not info: reaching here means a turn died without its `finally`. */
  log.warn({ count: stale.length, olderThanMs }, 'cleared stale busy agents');

  for (const id of new Set(stale.map(row => row.busyThreadId).filter(Boolean) as string[]))
    publish({ scope: 'thread', threadId: id });
};

/**
 * Presence rows: who is mid-turn in this thread, and the last step each ran.
 *
 * Agents parked in `run_agent` are left out. The orchestrator sits there for
 * the whole of every delegated turn, and a row saying it is working competes
 * with the workers that actually are. It reappears on its own when it goes
 * back to composing.
 */
export const listBusyAgents = async (threadId: string) => {
  const rows = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.status, 'busy'),
        eq(agents.busyThreadId, threadId),
        ne(agents.statusLabel, BLOCKED)
      )
    );
  if (!rows.length) return [];

  const recent = await db
    .select()
    .from(steps)
    .where(eq(steps.threadId, threadId))
    .orderBy(desc(steps.seq))
    .limit(1);
  const last = recent[0];

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    initials: r.initials,
    color: r.color,
    tag: r.role,
    statusLabel: r.statusLabel,
    lastStep: last ? { name: last.name, detail: last.detail } : null
  }));
};
