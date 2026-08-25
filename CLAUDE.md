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
- DeepSeek for AI (`@ai-sdk/deepseek`). Model is `deepseek-v4-flash` — v4 first, flash after.
  That name is real. Do not "correct" it. Set in `src/lib/server/ai/model.ts`.

## Keyed lists

- `{#each}` keys must be ids, never display strings.
- A label, name, title or timestamp is not an id. They repeat, and Svelte throws `each_key_duplicate`.
- No id on the row? Give it one at the source — the query, the mapper, the seed data. Do not key on the index.
- Grouping rows into runs? The group needs its own id too. The label it displays is not it.

## Tests

- Every feature ships with tests. Unit (Vitest), e2e (Playwright), or both.
- Pick unit for logic, e2e for user flows. When unsure, write both.
- No feature is done until its tests pass.

## Command output

- Redirect long-running commands to a log file: `npm test > ~/tmp/test.log 2>&1`.
- Applies to test runs, builds, dev servers, migrations — anything noisy.
- Name the file after the task: `~/tmp/groupchat-<task>.log`.
- Read the log to inspect results. Tell the user the path when it matters.
- Screenshots go under `~/tmp/` too — never into the repo. Playwright's `outputDir` already points there.

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

Before merging a branch into `master`, in order:

1. Merge `master` into the branch. Resolve conflicts there, not on `master`.
2. Write the tests for the feature.
3. Run the full suite. Everything must pass.
4. Only then merge the branch into `master`.

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

- Multiple agents run at once. Another agent may already hold the port.
- Check the port is free before starting a test server: `ss -ltn | grep :10302`.
- Taken? Use the next free port in the 10200+ range for that run. Do not kill the process holding it.

## Test isolation

- The e2e suite generates its own Postgres schema per run (`test_<pid>`).
  Do not pin `DATABASE_SCHEMA` — a shared name lets one agent's run wipe another's.
- Tests are served from `127.0.0.1`, not `localhost`. Cookies ignore the port,
  so `localhost` shares a jar with the dev server on :10200 and signs you out.
- Never hardcode a host in a test. Assert against `testInfo.project.use.baseURL`.

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
- After merging into `master`: remove the worktree (`git worktree remove`) and delete the branch (`git branch -d`).
- Only touch your own worktree and branch. Never remove or delete anyone else's.
