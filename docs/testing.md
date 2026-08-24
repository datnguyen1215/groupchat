# Testing

Three layers, all parallel by default.

```sh
npm run db:up      # Postgres must be running
npm test           # unit, then API + UI
npm run test:unit  # vitest — pure functions, no DB, no browser
npm run test:api   # playwright — HTTP against a real server and database
npm run test:ui    # playwright — Chromium at 1440×900
```

| Layer | Where | Count | Runtime |
| --- | --- | --- | --- |
| Unit | `tests/unit/` | 31 | ~0.1s |
| API | `tests/e2e/api/` | 49 | ~2.5s |
| UI | `tests/e2e/ui/` | 32 | ~10s |

## Schema isolation

**Tests never touch development data.** They run against a dedicated `test`
Postgres schema in the same container; only the `search_path` differs.

`tests/support/global-setup.ts` drops and rebuilds that schema from
`drizzle/*.sql` before every run, then seeds a small fixed baseline. Dev data
lives in `public` and is left alone — verified by asserting the row counts are
unchanged after a full run.

One wrinkle worth knowing: Drizzle hardcodes `"public"."enum_name"` on its
`CREATE TYPE` statements, which `search_path` cannot redirect. `resetSchema()`
rewrites that qualifier so the enums land beside their tables. If a future
migration fails only under test, check that rewrite first.

Point the tests at another schema with `DATABASE_SCHEMA=scratch npm run test:e2e`.

## Parallelism

`fullyParallel` is on, so specs in the same file run concurrently. Tests are
written to tolerate that:

- **Nothing mutates the seeded baseline.** A test that needs to write creates its
  own row with a name unique to its worker and timestamp.
- **No test asserts a global count**, since another worker may be inserting.
- Reads of the baseline (`eval-harness`, `kestrel`, `retrieval-eval`) are safe
  because no test edits them.

The one test that must attach a skill to an agent creates a throwaway agent
rather than reusing a seeded one — otherwise it would race any test reading that
agent's skills.

## What the UI tests cover

The frontend still reads `src/lib/data/`, **not** the API — wiring them together
is a separate step. So UI tests cover shell behaviour the frontend already owns:
rail scope, filters, modals, the activity drawer, and the composer clearing on
send. They do not assert that a page shows database rows, because it does not
yet.

`tests/support/ui.ts` exports `ready()`, which every UI test uses instead of a
bare `page.goto`. The markup is server-rendered, so a click fired before
hydration lands on inert HTML and is silently lost — `ready()` waits that out.
Skipping it produces flaky failures that look like missing elements.

## Gotchas found writing these

- Rail links carry a `title` **and** glyph text, so `getByRole('link', { name })`
  does not match. Target them by `href`.
- Both the threads lane and the docs lane are `<aside>`. The docs lane is
  `aside.w-[280px]`, and it is closed by default — open it from the header's
  *Documents* button first.
- The modal scrim carries `aria-label="Close"` outside the dialog, so scope close
  buttons to `getByRole('dialog')`.
- `toHaveClass` matches the whole class string; use `toContainClass` for one
  utility class.
