# REST API

Covers **agents**, **skills**, and **documents**. Threads and chat are not
exposed yet — the frontend still reads `src/lib/data/threads.ts` directly.

Base path `/api`. JSON in, JSON out. Single user, so there is no auth.

## Response shape

Reads return the resource under a named key, never a bare array:

```json
{ "skills": [ … ] }     // collection
{ "skill":  { … } }     // single
```

Errors are SvelteKit's error shape, with per-field detail on a 422:

```json
{
  "message": "Validation failed",
  "invalid": [{ "field": "name", "message": "is required" }]
}
```

| Status | When |
| --- | --- |
| 200 | Read or update succeeded |
| 201 | Created |
| 204 | Deleted, no body |
| 400 | Malformed JSON, or a patch with no writable field |
| 404 | No such id |
| 409 | Delete refused — the row is still referenced |
| 422 | Validation failed; see `invalid` |

Validation collects **every** field problem before responding, so a form fixes
in one round trip rather than one field per request.

## Compatibility note

Responses carry the fixture-shaped presentation fields (`authorInitials`,
`authorColor`, `threadName`, `size`, `updated`, `version: "v4"`) even though the
database does not store them. They are re-derived per request in
`src/lib/server/serialize.ts` so responses stay drop-in compatible with the
existing components. Canonical values travel alongside them —
`updatedAt` (ISO 8601) and `versionNumber` (integer) — and are what a client
should sort or compare on.

---

## Skills

### `GET /api/skills`

| Query | What |
| --- | --- |
| `authoredBy` | `you` or `agent` |
| `q` | Substring match over name and description |

### `POST /api/skills` → 201

```json
{
  "name": "relevance-judge",
  "authorId": "finch",
  "authoredBy": "agent",
  "description": "Grades a passage 0–3.",
  "body": "# relevance-judge\n…"
}
```

`name`, `authorId`, `authoredBy` are required. `authorId` must be an existing
agent. The id is a slug of the name, suffixed on collision (`my-skill-2`).

### `GET /api/skills/:id`

`usedBy` is a **live join** over `agent_skills`, not a stored column — attaching
a skill to an agent changes that skill's `usedBy` immediately.

### `PATCH /api/skills/:id`

Accepts `name`, `description`, `body`, `uses`. At least one is required.

**Version bumps in place.** Changing `name`, `description`, or `body` increments
`version`. Changing only `uses` does not — a metadata touch is not a revision.

### `DELETE /api/skills/:id` → 204

`agent_skills` rows cascade, so attachment disappears with the skill.

---

## Documents

### `GET /api/documents`

| Query | What |
| --- | --- |
| `threadId` | Only documents in that thread |
| `q` | Substring match over name, thread name, and author |

### `POST /api/documents` → 201

```json
{
  "name": "eval-protocol.md",
  "threadId": "retrieval-eval",
  "authorId": "kestrel",
  "body": "# Protocol\n…"
}
```

`name`, `threadId`, `authorId` required; the thread and agent must exist.

### `GET /api/documents/:id`

### `PATCH /api/documents/:id`

Accepts `name`, `body`, `threadId` — the last one moves the document between
threads. `name` or `body` bumps `version`; `threadId` alone does not.

### `DELETE /api/documents/:id` → 204

Messages that referenced the document keep their chip; `entries.doc_id` nulls
out rather than cascading the message away.

---

## Agents

### `GET /api/agents`

`?kind=` filters to `orchestrator`, `research`, `spawned`, or `you` — which is
how the Agents page's three tiers are fetched.

### `POST /api/agents` → 201

```json
{
  "name": "Wren",
  "kind": "research",
  "role": "Researcher",
  "description": "Finds and summarizes prior art.",
  "color": "#e8785d",
  "skills": ["paper-reader", "citation-format"]
}
```

`name` and `kind` are required. `initials` derives from the name when omitted.
Every id in `skills` must exist, or the whole request fails 422.

### `GET /api/agents/:id`

`stats` are **counted, not stored** — the fixtures' `'89 messages'` had no
source. Currently messages authored and documents authored. The fixtures' `tool
calls` and `wall clock` have no backing table and are gone.

### `PATCH /api/agents/:id`

Accepts every creation field. `skills` is a join and is replaced **wholesale** —
send the full desired set, not a delta.

### `DELETE /api/agents/:id` → 204

Returns **409** if the agent still authors any skill or document. Those FKs do
not cascade on purpose: deleting an author would orphan real content.

---

## Known gaps

**No version history.** `version` is an integer bumped in place; there is no
`skill_versions` table. An agent revising a skill you wrote overwrites it — it
does not fork. The document modal's *History* button stays inert until history
is modeled.

**No `POST /api/skills/:id/use`.** `uses` is writable through `PATCH`, which
means a client can set it to anything. A dedicated increment endpoint would be
the honest shape once something actually invokes skills.

**Threads and chat are untouched** — no endpoints, and the composer still does
nothing on send.
