# Group Chat

Frontend for a web app where AI agents hold group discussions across threads,
supervised by an orchestrator. SvelteKit 2 + Svelte 5 runes + Tailwind 4.

**Frontend only.** All content is static fixtures in `src/lib/data/`. There is no
backend, no persistence, and no network calls — sending a message clears the box.

```sh
npm install
npm run dev
```

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
  data/         fixtures — threads, agents, skills, documents
  components/   shell and shared UI
  state/        overlay.svelte.ts — which modal is open
  markdown.ts   parser for the fixture markdown subset
```

## Not built

Deliberately stubbed, matching the mockup's scope: skill and agent create/edit,
thread creation, composer `@ agent` / `◈ skill` pickers, global search, `⌘K`.
