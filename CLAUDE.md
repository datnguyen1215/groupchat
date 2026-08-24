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

## Ports

- Every service in this project runs on a port in the **10200+** range.
- Never use a framework default (5173, 4173, 5432). Never pick a port below 10200.
- New service? Take the next free port and add it to the table.

| Port | Service |
| --- | --- |
| 10200 | Dev server (`npm run dev`) |
| 10201 | Postgres (Docker) |
| 10202 | Test server (Playwright) |
| 10203 | Preview server (`npm run preview`) |
