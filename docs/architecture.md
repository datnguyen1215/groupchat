# Architecture

Stack, layout, and the decisions worth knowing. For the runtime behaviour, see
[how-it-works.md](how-it-works.md).

## Stack

- SvelteKit 2 + Svelte 5 (runes), TypeScript
- Tailwind CSS 4 via the Vite plugin, not PostCSS
- Postgres, accessed through Drizzle
- DeepSeek for the agents (`@ai-sdk/deepseek`)
- better-auth for sessions
- Vitest for unit tests, Playwright for e2e

## Layout

```
src/lib/
  server/
    ai/           the agent loops, prompts, tools, model
    db/           schema.ts (Drizzle), repo.ts (every write publishes)
    events/       in-memory SSE bus
    browser/      shared Playwright sessions for agents
  components/     shell and shared UI
  state/          overlay.svelte.ts — which modal is open
  markdown.ts     the markdown subset agents write
drizzle/          generated SQL migrations
scripts/seed.ts   agent roster and skills
tests/            unit, api, ui — see testing.md
docs/             this folder
```

## Routes

| Route         | What                                              |
| ------------- | ------------------------------------------------- |
| `/`           | Redirects to the newest thread, or an empty state |
| `/chats/[id]` | Conversation, activity drawer, thread documents   |
| `/agents`     | Orchestrator and the research roster              |
| `/skills`     | Skill registry with filters                       |
| `/documents`  | Every document across all threads, as a table     |
| `/login`      | Email and password                                |
| `/signup`     | Email, password, confirm                          |

API routes live under `/api` for threads, agents, skills, documents, events, and
auth. See [api.md](api.md).

## Shell

```
┌──────┬───────────┬──────────────────────────┬──────────┐
│ rail │  threads  │      conversation        │   docs   │
│ 66px │   230px   │        centered          │  280px   │
│      │           ├──────────────────────────┤ optional │
│Chats │           │  composer                │          │
│ ──── │           ├──────────────────────────┤          │
│Agents│           │  activity drawer (262px) │          │
│Skills│           │  closed by default       │          │
│ Docs │           │                          │          │
└──────┴───────────┴──────────────────────────┴──────────┘
```

The rail's divider encodes scope. **Chats** is thread-scoped and keeps the
threads sidebar. **Agents / Skills / Docs** are global full-page routes.

`DocModal` and `SkillModal` are mounted in the layout, so any page can open a
document or skill by id without a fetch.

## Data model

### Skills and documents are separate tables

Both are markdown with a version, but they are not the same thing. A skill is a
reusable procedure with author provenance (you vs. agent) and a use count. A
document belongs to exactly one thread and is checked against `ctx.threadId` on
every read, write, and delete.

### `usedBy` is a join, not a column

An earlier shape stored it on the skill _and_ as an array on each agent, which
could disagree. `agent_skills` is the single source.

### Entries and steps

`entries` is what you read in the thread — messages, document attachments,
errors. `steps` is what the activity drawer renders: one row per tool call, with
state and duration. They are separate because one message can sit on top of
dozens of tool calls.

The `activity` entry kind is retired. It stays in the enum only because Postgres
cannot drop enum values.

### Thread titles

`titled` is a boolean, not a name comparison. Auto-titling checks the flag, so
someone who renames a thread back to "Untitled" is never overwritten.

## Conventions

### Keyed lists

`{#each}` keys must be ids. A label, name, title, or timestamp is not an id —
they repeat, and Svelte throws `each_key_duplicate`. Grouping rows into runs?
The group needs its own id too.

### Logging

`pino` on the server via `src/lib/server/logger.ts`, matching call shape in the
browser via `src/lib/logger.svelte.ts`. Get one with `logger('area')`; components
use `trace('Name')`, which logs its own mount and unmount.

`error` failed. `warn` recovered. `info` is what happened. `debug` is
high-volume detail — per-event, per-tab, per-heartbeat. Every write in `repo.ts`
logs; reads do not, since the request line covers them.

Never log a field called `name` — pino reserves it. Use `threadName` or
`agentName`. Turn up the volume with `LOG_LEVEL=debug`, or
`localStorage.LOG_LEVEL = 'debug'` in the browser.

### Ports

Every service runs in the 10200+ range. No framework defaults.

| Port  | Service                  |
| ----- | ------------------------ |
| 10200 | Dev server               |
| 10201 | Postgres (Docker)        |
| 10203 | Preview server           |
| 10302 | Test server (Playwright) |

## Setup

```sh
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

| Script              | What                                                   |
| ------------------- | ------------------------------------------------------ |
| `db:up` / `db:down` | Start / stop the Postgres container                    |
| `db:generate`       | Generate a migration from `schema.ts` after editing it |
| `db:migrate`        | Apply pending migrations                               |
| `db:seed`           | Truncate and reload the roster. Idempotent             |
| `db:studio`         | Drizzle Studio, a browser UI over the tables           |

The seed ships **no fixture conversation** on purpose. Messages are what the
agents produce; seeding them would make it impossible to tell a real turn from a
fixture.

`.env` is required for `DEEPSEEK_API_KEY`. The database defaults are compiled in
(`src/lib/server/db/url.ts` and `docker-compose.yml`) — to override, change
`POSTGRES_PORT` and `DATABASE_URL` together.

## Not built

- **Agent spawning.** The schema supports it (`kind: 'spawned'`, `spawnedBy`,
  `instances`) and the UI has a section for it, but no code path creates a
  spawned agent.
- **Create/edit buttons.** "New agent", "New skill", "Import", "New document",
  and the document modal's Edit / History / Copy are rendered but inert.
- **Document history.** Versions bump in place; there is no history table.
- **`unread` counts.** The column exists and renders, but nothing increments or
  clears it.
- **`thread.live`.** A stored boolean, not derived from actual activity.
- **Multi-node.** The event bus is in-process. A second app process would see no
  live events.
