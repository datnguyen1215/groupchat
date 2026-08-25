import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../db';
import { documents, skills } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  appendMessage,
  appendStep,
  createDocument,
  deleteDocument,
  getDocument,
  getSkill,
  listAgents,
  listDocuments,
  listSkills,
  setAgentStatusTitle,
  updateDocument
} from '../repo';
import { logger, since } from '../logger';
import { researchTools, search } from '../research';
import { browserTools } from '../browser';
import { SILENT, nameFor, stateFor, summarise } from './detail';

const log = logger('tool');

/**
 * Wraps every tool's `execute` with one log pair: the call with its input, the
 * result with its duration. Applied once to the whole tool set rather than
 * written into each tool, so a new tool is traced the day it is added and no
 * two tools log in different shapes.
 *
 * It also writes the step row. That happens here, as each call finishes, rather
 * than in a sweep after the turn: the presence row shows the steps an agent has
 * already completed, and a row written at the end of the turn arrives after the
 * only moment it had a reader.
 *
 * Input is logged in full at `debug` — a document body belongs there, not in
 * the default stream — and summarised at `info` by `summarise`.
 */

const traced = <T extends Record<string, any>>(ctx: ToolContext, tools: T): T => {
  const wrapped = Object.entries(tools).map(([name, definition]) => {
    const run = definition.execute;
    const execute = async (input: unknown, options: { toolCallId?: string }) => {
      const start = Date.now();
      const base = { tool: name, agentId: ctx.agentId, threadId: ctx.threadId };

      log.info({ ...base, detail: summarise(input) }, 'call');
      log.debug({ ...base, input }, 'call input');

      /** Both paths record: a call that threw still took the time it took. */
      const record = async () => {
        if (SILENT.has(name)) return;
        const state = stateFor(name);
        await appendStep({
          threadId: ctx.threadId,
          groupLabel: ctx.agentName,
          state,
          name: nameFor(ctx.agentName, name),
          detail: summarise(input),
          durationMs: since(start),
          badge: state === 'spawn' ? 'agent' : undefined
        });
      };

      try {
        const result = await run(input, options);
        /** A tool that returns `{ error }` failed the agent without throwing. */
        const failed = Boolean(result && typeof result === 'object' && 'error' in result);
        log[failed ? 'warn' : 'info'](
          { ...base, ms: since(start), ...(failed ? { error: result.error } : {}) },
          failed ? 'rejected' : 'ok'
        );
        log.debug({ ...base, result }, 'call result');
        await record();
        return result;
      } catch (error) {
        log.error({ ...base, ms: since(start), err: error }, 'threw');
        await record();
        throw error;
      }
    };
    return [name, { ...definition, execute }];
  });

  return Object.fromEntries(wrapped) as T;
};

/**
 * The agents' tools. Every one of them goes through `repo.ts`, the same module
 * the REST routes call — so a skill an agent reads is the skill the API serves.
 * There is no second source of truth.
 *
 * `ctx` carries who is acting and where. It is never model input: the model
 * cannot post as another agent or into another thread.
 */
export type ToolContext = {
  threadId: string;
  agentId: string;
  /** The step row's `groupLabel` — which agent's run this call belongs to. */
  agentName: string;
  tag: string;
  /**
   * The queries this turn has already run, lowercased. A fresh `ctx` is built
   * per turn in `loop.ts`, so the set is turn-scoped without anything having to
   * clear it.
   */
  searched?: Set<string>;
};

/**
 * The presence row is one line beside an avatar. Past this the title is
 * ellipsised there anyway, and the cap is what stops the model writing a
 * sentence into a field that renders as a label.
 */
const STATUS_TITLE_MAX = 60;

/**
 * How many distinct searches one turn may run.
 *
 * Left alone, a model that cannot find an answer keeps rephrasing the same
 * question. The cap turns that loop into an instruction to write up what it has.
 */
const SEARCH_BUDGET = 6;

/** Escapes a value for embedding in a `RegExp`. Document ids are slugs, but not guaranteed. */
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Separates a document-id echo from the message text.
 *
 * Models handle the attachment two ways, and both need cleaning up. Some fill
 * `docId` correctly and then write the id into the text as well, which renders
 * as a stray line above the chip that already names the document. Others write
 * the id into the text *instead* of passing the field, so the document is left
 * with no chip at all and the line is the only reference to it.
 *
 * So the echo is always dropped from the text, and when no field was passed
 * the id it names is adopted as the attachment. Instructing against this in
 * the tool description did not stop either habit.
 */
const DOC_ECHO = /^\s*doc(?:ument)?[ _]?id\s*[:=]\s*"?([\w.-]+)"?\s*$/i;

export const withoutDocEcho = (paragraphs: string[], docId?: string) => {
  const echoed = paragraphs.map(p => DOC_ECHO.exec(p)?.[1]);

  /** Only an echo of the attachment itself, or of the id it is adopting. */
  const adopted = docId ?? echoed.find(Boolean);
  const kept = paragraphs.filter(
    (p, i) => p.trim() && !(echoed[i] !== undefined && echoed[i] === adopted)
  );

  return { paragraphs: kept.length ? kept : paragraphs, docId: adopted };
};

/** A window of body text around the first match, so search results are skimmable. */
export const excerpt = (body: string, needle: string) => {
  const at = body.toLowerCase().indexOf(needle);
  if (at < 0) return '';
  const start = Math.max(0, at - 40);
  const slice = body
    .slice(start, start + 160)
    .replace(/\s+/g, ' ')
    .trim();
  return `${start > 0 ? '...' : ''}${slice}${start + 160 < body.length ? '...' : ''}`;
};

/** Read-side tools. Both the orchestrator and the workers get these. */
const readTools = (ctx: ToolContext) => ({
  /**
   * The description and the HTTP live in `research/`; what is added here is the
   * turn's budget, which belongs to a turn and is not that module's business.
   */
  web_search: tool({
    description: researchTools.web_search.description,
    inputSchema: researchTools.web_search.inputSchema,
    execute: async ({ query }: { query: string }) => {
      const seen = ctx.searched;
      const key = query.trim().toLowerCase();

      if (seen?.has(key)) {
        log.warn({ agentId: ctx.agentId, threadId: ctx.threadId, query }, 'search repeated');
        return 'You already ran this exact search. Use what it returned rather than running it again.';
      }

      if (seen && seen.size >= SEARCH_BUDGET) {
        log.warn(
          { agentId: ctx.agentId, threadId: ctx.threadId, query, distinct: seen.size },
          'search budget spent'
        );
        return `You have searched ${seen.size} times, which is your limit. Stop searching and work from what you already found.`;
      }

      seen?.add(key);

      const hits = await search(query);

      if (hits.length === 0) {
        return 'Nothing came back for that. Say so plainly, or try one differently-worded search — not several.';
      }

      return hits;
    }
  }),

  ...browserTools(ctx.threadId),

  list_skills: tool({
    description: 'List every skill available, with its id and description.',
    inputSchema: z.object({}),
    execute: async () => {
      const all = await listSkills();
      return all.map(s => ({ id: s.id, name: s.name, description: s.description }));
    }
  }),

  read_skill: tool({
    description: 'Read the full body of one skill by id.',
    inputSchema: z.object({ id: z.string().describe('The skill id from list_skills.') }),
    execute: async ({ id }) => {
      const skill = await getSkill(id);
      if (!skill) return { error: `No skill with id "${id}".` };
      /** Reading a skill is a use; the count is what the skills page ranks by. */
      await db
        .update(skills)
        .set({ uses: sql`${skills.uses} + 1` })
        .where(eq(skills.id, id));
      return { id: skill.id, name: skill.name, body: skill.body };
    }
  }),

  list_documents: tool({
    description: 'List the documents in this thread.',
    inputSchema: z.object({}),
    execute: async () => {
      const all = await listDocuments(ctx.threadId);
      return all.map(d => ({ id: d.id, name: d.name, author: d.author }));
    }
  }),

  read_document: tool({
    description: 'Read the full body of one document in this thread, by id.',
    inputSchema: z.object({ id: z.string().describe('The document id from list_documents.') }),
    execute: async ({ id }) => {
      const doc = await getDocument(id);
      /**
       * Same thread check the write path makes. An id is guessable and can be
       * carried in from anywhere, so the read is filtered here rather than
       * trusting that the id came from this thread's `list_documents`.
       */
      if (!doc || doc.threadId !== ctx.threadId) return { error: `No document with id "${id}".` };
      return { id: doc.id, name: doc.name, body: doc.body };
    }
  }),

  search_documents: tool({
    description:
      'Find documents in this thread whose name or body contains some text. ' +
      'Use this before writing a new document, to check whether one already exists.',
    inputSchema: z.object({
      query: z.string().describe('The text to look for. Case-insensitive.')
    }),
    execute: async ({ query }) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      const all = await listDocuments(ctx.threadId);
      const hits = all.filter(d => `${d.name} ${d.body}`.toLowerCase().includes(needle));
      return hits.map(d => ({
        id: d.id,
        name: d.name,
        author: d.author,
        excerpt: excerpt(d.body, needle)
      }));
    }
  })
});

/** Write-side tools. Shared, because a worker's whole job is producing output. */
const writeTools = (ctx: ToolContext) => ({
  write_document: tool({
    description:
      'Write a new markdown document into this thread. Search first — if the subject is ' +
      'already covered, update that document instead of writing a second one. Returns the ' +
      'id, which you attach to a chat message with docId.',
    inputSchema: z.object({
      name: z
        .string()
        .describe(
          'A short title in plain English, e.g. "Eval Protocol v1". Words with spaces, ' +
            'the way you would title a document for a colleague. Not a filename — no ' +
            'dashes or underscores between words.'
        ),
      body: z
        .string()
        .describe(
          'The full markdown body. Lead with the conclusion. Written for someone who ' +
            'missed the thread.'
        )
    }),
    execute: async ({ name, body }) => {
      /**
       * A second document under a name the thread already uses is the
       * duplicate this tool exists to prevent — most often an orchestrator
       * recording a decision as a fresh copy of the document it decided on.
       * Ids are generated, so nothing else catches it: the thread would just
       * hold two documents of the same name with no way to tell which is
       * current.
       */
      const clash = (await listDocuments(ctx.threadId)).find(
        d => d.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (clash)
        return {
          error: `"${name}" already exists in this thread (id "${clash.id}"). Revise it with update_document.`,
          id: clash.id
        };

      const id = await createDocument({
        name,
        threadId: ctx.threadId,
        authorId: ctx.agentId,
        body
      });
      return { id, name };
    }
  }),

  update_document: tool({
    description:
      'Revise a document that already exists in this thread. Replaces the body and ' +
      'bumps its version. Prefer this over writing a near-duplicate document.',
    inputSchema: z.object({
      id: z.string().describe('The document id from list_documents or search_documents.'),
      body: z.string().describe('The full new markdown body. This replaces the old body.'),
      name: z
        .string()
        .optional()
        .describe('A new title, if it should be renamed. Plain English with spaces.')
    }),
    execute: async ({ id, body, name }) => {
      const doc = await getDocument(id);
      if (!doc) return { error: `No document with id "${id}".` };
      /** Thread-scoped on purpose: an agent revises its own thread's docs, not another's. */
      if (doc.threadId !== ctx.threadId)
        return { error: `Document "${id}" belongs to another thread.` };

      /** Same repo call the PATCH route makes, so both paths bump alike. */
      await updateDocument(id, { body, ...(name ? { name } : {}) });

      return { id, name: name ?? doc.name, version: doc.versionNumber + 1 };
    }
  }),

  delete_document: tool({
    description:
      'Delete a document from this thread. Use this only for a document that is ' +
      'genuinely obsolete or was written by mistake.',
    inputSchema: z.object({
      id: z.string().describe('The document id from list_documents or search_documents.')
    }),
    execute: async ({ id }) => {
      const doc = await getDocument(id);
      if (!doc) return { error: `No document with id "${id}".` };
      if (doc.threadId !== ctx.threadId)
        return { error: `Document "${id}" belongs to another thread.` };

      /** Messages referencing it keep their chip; `entries.doc_id` nulls out. */
      await deleteDocument(id);
      return { id, deleted: true };
    }
  }),

  send_chat_message: tool({
    description:
      'Say something to the group. This posts a message into the chat under your own name. ' +
      'Keep it short and conversational, the way a person talks in a group chat. ' +
      'Attaching a document? Pass its id as docId, not in the text. ' +
      'You may call this more than once in a turn, then call finish when you have nothing left to add.',
    inputSchema: z.object({
      paragraphs: z
        .array(z.string())
        .describe('What you are saying. Usually one line. Not an essay. No preamble.'),
      docId: z
        .string()
        .optional()
        .describe('Optional id of a document to attach, from write_document.')
    }),
    execute: async ({ paragraphs, docId }) => {
      await appendMessage({
        threadId: ctx.threadId,
        authorId: ctx.agentId,
        tag: ctx.tag,
        ...withoutDocEcho(paragraphs, docId)
      });
      return { posted: true };
    }
  }),

  set_status: tool({
    description:
      'Say what you are working on right now, in a few words. Call this before each ' +
      'piece of work so the people watching can see what you are doing. This is not ' +
      'chat — nobody is replying to it, and it does not count as speaking.',
    inputSchema: z.object({
      title: z
        .string()
        .max(STATUS_TITLE_MAX)
        .describe(
          'A short phrase naming the work, like "Comparing payment terms" or ' +
            '"Reading the Q3 vendor quotes". Present tense. No trailing full stop.'
        )
    }),
    execute: async ({ title }) => {
      const clean = title.trim().slice(0, STATUS_TITLE_MAX);
      if (!clean) return { error: 'A status needs a title.' };
      await setAgentStatusTitle(ctx.agentId, clean);
      return { ok: true };
    }
  }),

  finish: tool({
    description:
      'End your turn. Call this when you have said everything you want to say and have nothing left to add.',
    inputSchema: z.object({}),
    execute: async () => ({ done: true })
  })
});

/** What a spawned worker can do: read, write, speak, stop. */
export const workerTools = (ctx: ToolContext) =>
  traced(ctx, {
    ...readTools(ctx),
    ...writeTools(ctx)
  });

/**
 * The orchestrator's extra two. `run_agent` blocks until the worker's loop
 * ends and hands back its report, which keeps the floor single-threaded —
 * one participant speaks at a time, and nobody talks over anybody.
 */
export const orchestratorTools = (
  ctx: ToolContext,
  runAgent: (agentId: string, task: string) => Promise<string>
) =>
  traced(ctx, {
    ...readTools(ctx),
    ...writeTools(ctx),

    list_agents: tool({
      description: 'List the agents you can delegate work to.',
      inputSchema: z.object({}),
      execute: async () => {
        const all = await listAgents('research');
        return all.map(a => ({
          id: a.id,
          name: a.name,
          role: a.role,
          description: a.description,
          status: a.status
        }));
      }
    }),

    run_agent: tool({
      description:
        'Delegate a task to one agent and wait for its report. The agent works, ' +
        'posts its own messages to the chat, and returns a summary to you.',
      inputSchema: z.object({
        agentId: z.string().describe('The agent id from list_agents.'),
        task: z.string().describe('What you want that agent to do. Be specific.')
      }),
      execute: async ({ agentId, task }) => {
        const report = await runAgent(agentId, task);
        return { agentId, report };
      }
    })
  });
