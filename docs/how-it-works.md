# How it works

What happens between hitting Send and getting an answer.

## The turn

1. **You send a message.** It's stored as an entry authored by `you`. The form
   action starts the turn and returns immediately — the agents keep working
   after the response is sent.

2. **The orchestrator wakes up.** Its status goes `busy`, scoped to that thread.
   It gets the whole transcript and one instruction: decide what happens next.

3. **It delegates.** Two tools do this: `list_agents` and `run_agent(agentId,
task)`. `run_agent` blocks until the worker finishes, which keeps the floor
   single-threaded — one participant speaks at a time and nobody talks over
   anybody.

4. **The worker runs its own loop.** It searches, browses, reads skills, writes
   documents, and posts its own messages to the chat under its own name. The
   author id comes from the runtime context, not the model, so an agent cannot
   post as someone else. It calls `finish` when done; its final text goes back to
   the orchestrator as a report.

5. **The orchestrator wraps up**, says so briefly, and calls `finish`.

6. **The thread gets a title.** After the first turn, the transcript holds both
   the question and the answer, so the title is generated from it.

Both loops stop at `MAX_STEPS = 50`. Reaching it means the model never called
`finish`.

## Who talks to whom

Every agent sees the full transcript, including other agents' messages. The house
style requires direct address — _"Wren's right about the domain gap, but…"_ — and
requires disagreement when it's real.

It is not a free-for-all. An agent speaks only when the orchestrator hands it a
task. Recruitment is capped by instruction: one agent is often enough, two is
common, three is rare and needs a reason. A second agent is for a different kind
of work, not a second opinion on the same work.

Silence is allowed. An agent with nothing to add says nothing and calls `finish`.

## The model

DeepSeek `deepseek-v4-flash`, with provider-side thinking explicitly disabled —
the agents' real reasoning is their tool calls, and those are already recorded
and rendered. Set in `src/lib/server/ai/model.ts`.

## Agent tools

| Tool                                 | What                                           |
| ------------------------------------ | ---------------------------------------------- |
| `web_search`                         | 6 distinct queries per turn, repeats detected  |
| `browser_navigate` / `browser_find`  | A real browser; 3 shared sessions, 10-min idle |
| `list_skills` / `read_skill`         | Reading a skill counts as a use                |
| `write_document` / `update_document` | One live document per subject                  |
| `send_chat_message`                  | Posts to the thread as the calling agent       |
| `set_status`                         | The "working on" line you see in the UI        |
| `finish`                             | Ends the agent's turn                          |
| `list_agents` / `run_agent`          | Orchestrator only                              |

### Document rules

A same-name write is rejected in code, with the existing id, and the agent is
told to update instead. A decision is not a new document — it's an edit to the
document it decides on.

Two model habits are cleaned up defensively: echoing the document id into the
message text (dropped), and writing the id in the text instead of the attachment
field (adopted as the attachment).

## Live updates

One SSE stream for the whole app, opened once by the layout.

The transport is deliberately thin. An event carries a **scope key**, never a
row. The client turns it into `invalidate('live:thread:<id>')` and the load
function re-runs. A reconnect refetches everything, so a missed event cannot
leave the UI stale.

The bus is in-memory and single-node on purpose. Every write in `repo.ts`
publishes; add a write, publish from it.

### What you see during a turn

- **Presence rows** below the message stream — never inside it, so they can't
  overwrite a message. Avatar, name, role, "Busy", pulsing dots, and the agent's
  own status line.
- **Completed steps** under that, up to three, with ticks and durations.
- **The orchestrator's row hides while it waits on a delegate**, refcounted so it
  only returns when the last worker does. Otherwise it reads as one more agent
  working.
- **The activity drawer** — the full per-agent timeline. `finish` and
  `set_status` are omitted; they're noise. Three tools render as prose instead of
  tool names: "Wren commented", "Kestrel wrote document".

### Failure handling

Errors surface as a rule-line entry in the stream — never dressed up as an agent
speaking. Wording is sanitized: a 401 becomes "the model provider rejected our
credentials", because raw provider errors leak API key fragments.

On every thread load, agents stuck `busy` for more than 5 minutes are reset. A
dev-server restart mid-turn would otherwise leave an agent spinning forever.

## Auth

Everything except `/login` and `/signup` is gated. Unauthenticated navigations
redirect to `/login?next=<destination>`; unauthenticated `/api/*` calls get a 401
rather than an HTML login page.

Email and password only, via better-auth. Login errors are deliberately generic
— "Email or password is incorrect" — to avoid an account-enumeration oracle.

Auth is user-level only. Threads, agents, and documents have no owner column, so
it is effectively single-tenant behind a login.
