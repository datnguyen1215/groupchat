import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

/** Presentation identity (initials, colour) lives on the agent, not on every row that mentions it. */
export const agentKind = pgEnum('agent_kind', ['orchestrator', 'research', 'spawned', 'you']);
export const agentStatus = pgEnum('agent_status', ['idle', 'busy', 'done']);

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  color: text('color').notNull(),
  kind: agentKind('kind').notNull(),
  role: text('role').notNull().default(''),
  description: text('description').notNull().default(''),
  status: agentStatus('status').notNull().default('idle'),
  statusLabel: text('status_label').notNull().default('Idle'),
  /** Ephemeral agents collapse into one card; this is the ×3 in `paper-reader ×3`. */
  instances: integer('instances').notNull().default(1),
  spawnedBy: text('spawned_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const threadGroup = pgEnum('thread_group', ['Active', 'Recent']);

export const threads = pgTable('threads', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  group: threadGroup('group').notNull().default('Active'),
  live: boolean('live').notNull().default(false),
  unread: integer('unread').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Skills and documents are deliberately separate tables. They look alike — both are
 * markdown with a version — but a skill is a reusable capability with an author
 * provenance split (you vs. agent) and a use count, and a document belongs to one thread.
 */
export const authoredBy = pgEnum('authored_by', ['you', 'agent']);

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Bumped in place on every write. No history table — see docs/api.md. */
  version: integer('version').notNull().default(1),
  description: text('description').notNull().default(''),
  authorId: text('author_id')
    .notNull()
    .references(() => agents.id),
  authoredBy: authoredBy('authored_by').notNull(),
  body: text('body').notNull().default(''),
  uses: integer('uses').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * `usedBy` is derived from this join, never stored on the skill — the fixture's
 * `usedBy: string[]` could drift from each agent's own skill list.
 */
export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' })
  },
  t => [uniqueIndex('agent_skills_pair').on(t.agentId, t.skillId)]
);

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  authorId: text('author_id')
    .notNull()
    .references(() => agents.id),
  version: integer('version').notNull().default(1),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * One table for both message and activity-strip entries — they interleave in one
 * ordered stream, and splitting them means merge-sorting on read.
 */
export const entryKind = pgEnum('entry_kind', ['message', 'activity']);

export const entries = pgTable('entries', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  kind: entryKind('kind').notNull(),
  /** Monotonic within a thread. Ordering key; also the SSE cursor. */
  seq: integer('seq').notNull(),
  authorId: text('author_id').references(() => agents.id),
  tag: text('tag'),
  paragraphs: jsonb('paragraphs').$type<string[]>().notNull().default([]),
  docId: text('doc_id').references(() => documents.id, { onDelete: 'set null' }),
  /** Activity strips only: the sparkline. */
  label: text('label'),
  bars: jsonb('bars').$type<('ok' | 'run' | 'spawn')[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const stepState = pgEnum('step_state', ['ok', 'run', 'spawn']);

/** The activity drawer's trace. `parentId` is the sub-agent indent. */
export const steps = pgTable('steps', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id, { onDelete: 'cascade' }),
  groupLabel: text('group_label').notNull(),
  seq: integer('seq').notNull(),
  state: stepState('state').notNull(),
  name: text('name').notNull(),
  detail: text('detail').notNull().default(''),
  durationMs: integer('duration_ms'),
  parentId: text('parent_id'),
  badge: text('badge'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
