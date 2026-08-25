# Rules

- `handoffs/` is gitignored. It holds agent-to-agent handoff notes only.
- Never commit anything under `handoffs/`.
- Write a handoff to `handoffs/` before passing work to another agent.
- Read the relevant `handoffs/` file before starting work handed to you.

## Communication

- Short sentences only. No long sentences.
- Prefer bullet points over paragraphs.
- Keep thinking short too.
- Say less. The user does not want to read much.
- Ask one question at a time. Never bundle questions.

## Stack

- SvelteKit 2 + Svelte 5 (runes). TypeScript.
- Tailwind CSS 4 (Vite plugin, not PostCSS).
- Postgres via `postgres` (no ORM).
- Vitest for unit tests. Playwright for e2e.

## Live updates

- SSE pushes thread changes to the browser. One stream for the whole app.
- The bus is **in-memory** (`src/lib/server/events/bus.ts`). Keep it that way.
- Single node. No plan for more than one. Do not add Redis or `LISTEN/NOTIFY`.
- Every write in `repo.ts` publishes. Add a write? Publish from it.

## Logging

- Server: `pino`, via `src/lib/server/logger.ts`. Browser: `src/lib/logger.svelte.ts`. Same call shape.
- Get one with `logger('area')`. Components use `trace('Name')` — it logs mount/unmount itself.
- `error` failed. `warn` recovered. `info` is what happened. `debug` is high-volume detail.
- Default to `info`. Reach for `debug` only when a line fires per-event, per-tab or per-heartbeat.
- Every write in `repo.ts` logs. Reads do not — the request line covers them.
- Never log a field called `name`; pino reserves it. Use `threadName`, `agentName`.
- Turn on the noisy lines with `LOG_LEVEL=debug`, or `localStorage.LOG_LEVEL = 'debug'` in the browser.

## Git

- Commit `package-lock.json` in its own separate commit. Never mix it with code changes.

## Ports

- Every service in this project runs on a port in the **10200+** range.
- Never use a framework default (5173, 4173, 5432). Never pick a port below 10200.
- New service? Take the next free port and add it to the table.

| Port  | Service                                  |
| ----- | ---------------------------------------- |
| 10200 | Dev server (`npm run dev`)               |
| 10201 | Postgres (Docker)                        |
| 10203 | Preview server (`npm run preview`)       |
| 10204 | UI mockup server (`ui-variations` skill) |
| 10302 | Test server (Playwright)                 |

## Reports

- Report what changed and that it passed. Nothing else.
- No "design calls", "worth flagging", or "notes" sections.
- Fixed is fixed. Do not report failures you already fixed.

## Worktrees

Multi-agent environment. Never edit the main checkout directly.

- Create a git worktree for each session's changes.
- Put it under `~/tmp/` — e.g. `~/tmp/groupchat-<task>`.
- Do all work in that worktree.
- Spawning agents? Tell each one the worktree path. They must work there too.
- After merging into `main`: remove the worktree (`git worktree remove`) and delete the branch (`git branch -d`).
- Only touch your own worktree and branch. Never remove or delete anyone else's.
