# Group Chat

Frontend for a web app where AI agents hold group discussions across threads,
supervised by an orchestrator. SvelteKit 2 + Svelte 5 runes + Tailwind 4.

## Setup

Postgres runs in Docker; the app runs on the host.

```sh
npm install
cp .env.example .env
npm run db:up        # Postgres 17 on 127.0.0.1:10102
npm run db:migrate   # apply drizzle/ migrations
npm run db:seed      # load src/lib/data/ fixtures into the database
npm run dev
```

Port 10102 rather than 5432 because a native Postgres already holds 5432 on the
dev machine. Change `POSTGRES_PORT` and `DATABASE_URL` in `.env` together.

| Script | What |
| --- | --- |
| `db:up` / `db:down` | Start / stop the Postgres container |
| `db:generate` | Generate a migration from `schema.ts` after editing it |
| `db:migrate` | Apply pending migrations |
| `db:seed` | Truncate and reload the fixtures. Idempotent |
| `db:studio` | Drizzle Studio, a browser UI over the tables |

## Shell

Implements `mockups/b-focus-column.html` (see `handoffs/` for the design review).

```
┌──────┬───────────┬──────────────────────────┬──────────┐
│ rail │  threads  │      conversation        │   docs   │
│ 66px │   230px   │   (centered ~620px)      │  280px   │
│      │           ├──────────────────────────┤ optional │
│Chats │           │  composer                │          │
│ ──── │           ├──────────────────────────┤          │
│Agents│           │  activity drawer (262px) │          │
│Skills│           │  closed by default       │          │
│ Docs │           │                          │          │
└──────┴───────────┴──────────────────────────┴──────────┘
```

The rail's divider encodes scope: **Chats** is thread-scoped and keeps the
threads sidebar; **Agents / Skills / Docs** are global full-page routes.

## Routes

| Route | What |
| --- | --- |
| `/` | Redirects to the first thread |
| `/chats/[id]` | Conversation, activity drawer, thread documents |
| `/agents` | Orchestrator, research roster, agents spawned this session |
| `/skills` | Skill registry with filters; modal has About / Used by |
| `/documents` | Every document across all threads, as a table |

## Layout

```
src/lib/
  data/         seed fixtures — threads, agents, skills, documents
  server/db/    schema.ts (Drizzle) and the client
  components/   shell and shared UI
  state/        overlay.svelte.ts — which modal is open
  markdown.ts   parser for the fixture markdown subset
drizzle/        generated SQL migrations
scripts/seed.ts fixtures to database, one shot
```

## Data model

Seven tables. Two decisions worth knowing:

**Skills and documents are separate tables**, though both are markdown with a
version. A skill is a reusable capability with author provenance (you vs. agent)
and a use count; a document belongs to exactly one thread.

**`usedBy` is a join, not a column.** The fixtures stored it on the skill *and*
as a `skills` array on each agent, which could disagree. `agent_skills` is now
the single source and the seed unions both fixture fields into it.

Presentation fields the fixtures denormalized (`initials`, `color`,
`authorColor`, `threadName`) are gone — `author_id` points at `agents`. `size`
derives from the body length and `updated` is a real `timestamptz` rather than
the string `'Yesterday'`.

## Not built

The frontend still reads `src/lib/data/` directly; nothing queries the database
yet. REST routes and the frontend rewiring are the next step.

Also stubbed, matching the mockup's scope: skill and agent create/edit, thread
creation, composer `@ agent` / `◈ skill` pickers, global search, `⌘K`.

**No version history.** `version` is an integer bumped in place; the document
modal's "History" button stays inert until history is modeled.
