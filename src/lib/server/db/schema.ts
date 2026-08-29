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
  /**
   * What the agent says it is doing, in its own words — "Comparing payment terms".
   * Written by the `set_status` tool, cleared when the turn ends. Distinct from
   * `statusLabel`, which is a fixed vocabulary the presence query filters on.
   */
  statusTitle: text('status_title'),
  /**
   * Which thread this agent is busy in; null when idle. An agent is a global
   * row, so `status` alone would render a presence row in every thread at once.
   */
  busyThreadId: text('busy_thread_id'),
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
  /**
   * Set once the thread has a name it is meant to keep — either the
   * orchestrator generated one at the end of its first turn, or a person typed
   * one. Guards the generator so it never fires twice, including on a thread
   * someone renamed back to the default.
   */
  titled: boolean('titled').notNull().default(false),
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
 * One table for message and error entries — they interleave in one ordered
 * stream, and splitting them means merge-sorting on read.
 *
 * An `error` is deliberately not a message. A failed turn is not an agent
 * choosing to speak, so it carries no `authorId` and renders without an avatar
 * or a name; `label` holds the one safe line it is allowed to show.
 */
/**
 * `activity` is retired: the feed reads `steps`, so the stream is people
 * talking and failures only. The value stays in the enum because Postgres
 * cannot drop one, and old rows still carry it.
 */
export const entryKind = pgEnum('entry_kind', ['message', 'activity', 'error']);

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
  /** Activity strips: the strip's caption. Errors: the one safe line to show. */
  label: text('label'),
  bars: jsonb('bars').$type<('ok' | 'run' | 'spawn')[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
},
  t => [
    /**
     * `seq` is the ordering key and the SSE cursor, so a duplicate is not a
     * cosmetic problem. The index makes a racing append fail loudly instead of
     * quietly writing a second row under a number already taken.
     */
    uniqueIndex('entries_thread_seq').on(t.threadId, t.seq)
  ]
);

/**
 * What one activity row is. `ok`/`run`/`spawn` are tool calls; `say` is an
 * agent commenting, `doc` is a document written or updated. All four land in
 * the same table because the drawer shows one timeline, and splitting them
 * means merge-sorting on read.
 */
export const stepState = pgEnum('step_state', ['ok', 'run', 'spawn', 'say', 'doc']);

/** The activity feed's trace. `parentId` is the sub-agent indent. */
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
},
  t => [uniqueIndex('steps_thread_seq').on(t.threadId, t.seq)]
);

/**
 * better-auth owns these four tables. The shapes are dictated by its drizzle
 * adapter — see `getAuthTables()` — so nothing here is free to change.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  /** Hashed by better-auth. Null for non-credential providers. */
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
