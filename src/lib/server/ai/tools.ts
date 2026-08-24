import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../db';
import { documents, skills } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  appendMessage,
  getDocument,
  getSkill,
  listAgents,
  listDocuments,
  listSkills,
  uniqueId
} from '../repo';
import { logger, since } from '../logger';
import { detailOf } from './detail';

const log = logger('tool');

/**
 * Wraps every tool's `execute` with one log pair: the call with its input, the
 * result with its duration. Applied once to the whole tool set rather than
 * written into each tool, so a new tool is traced the day it is added and no
 * two tools log in different shapes.
 *
 * Input is logged in full at `debug` — a document body belongs there, not in
 * the default stream — and summarised at `info` by `summarise`.
 */

/**
 * The `info` summary of a tool's input.
 *
 * `detailOf` alone is not enough here: it only reads string values, and the
 * most interesting call — `send_chat_message` — carries `{ paragraphs: [...] }`,
 * so it would log a blank detail on the one line worth reading. Arrays of
 * strings are joined first; the drawer never sees these tools, so this stays
 * out of `detailOf` rather than changing what the drawer renders.
 */
const summarise = (input: unknown) => {
  const direct = detailOf(input);
  if (direct || !input || typeof input !== 'object') return direct;

  const joined = Object.values(input as Record<string, unknown>)
    .filter((v): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string'))
    .map(v => v.join(' '))
    .find(Boolean);

  if (!joined) return '';
  return joined.length > 80 ? `${joined.slice(0, 77)}...` : joined;
};
const traced = <T extends Record<string, any>>(ctx: ToolContext, tools: T): T => {
  const wrapped = Object.entries(tools).map(([name, definition]) => {
    const run = definition.execute;
    const execute = async (input: unknown, options: unknown) => {
      const start = Date.now();
      const base = { tool: name, agentId: ctx.agentId, threadId: ctx.threadId };

      log.info({ ...base, detail: summarise(input) }, 'call');
      log.debug({ ...base, input }, 'call input');

      try {
        const result = await run(input, options);
        /** A tool that returns `{ error }` failed the agent without throwing. */
        const failed = Boolean(result && typeof result === 'object' && 'error' in result);
        log[failed ? 'warn' : 'info'](
          { ...base, ms: since(start), ...(failed ? { error: result.error } : {}) },
          failed ? 'rejected' : 'ok'
        );
        log.debug({ ...base, result }, 'call result');
        return result;
      } catch (error) {
        log.error({ ...base, ms: since(start), err: error }, 'threw');
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
  tag: string;
};

/** Thread-only by default: an agent sees its own thread unless it asks wider. */
const scopeSchema = z
  .enum(['thread', 'all'])
  .optional()
  .describe('"thread" (default) for this thread only, "all" for every thread.');

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
    description:
      'List documents. Defaults to this thread; pass scope "all" to see documents ' +
      'from every thread, which is how you find prior work to build on.',
    inputSchema: z.object({
      scope: scopeSchema
    }),
    execute: async ({ scope }) => {
      const all = await listDocuments(scope === 'all' ? undefined : ctx.threadId);
      return all.map(d => ({
        id: d.id,
        name: d.name,
        author: d.author,
        threadName: d.threadName
      }));
    }
  }),

  read_document: tool({
    description: 'Read the full body of one document by id.',
    inputSchema: z.object({ id: z.string().describe('The document id from list_documents.') }),
    execute: async ({ id }) => {
      const doc = await getDocument(id);
      if (!doc) return { error: `No document with id "${id}".` };
      return { id: doc.id, name: doc.name, body: doc.body };
    }
  }),

  search_documents: tool({
    description:
      'Find documents whose name or body contains some text. Defaults to this thread; ' +
      'pass scope "all" to search every thread. ' +
      'Use this before writing a new document, to check whether one already exists.',
    inputSchema: z.object({
      query: z.string().describe('The text to look for. Case-insensitive.'),
      scope: scopeSchema
    }),
    execute: async ({ query, scope }) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      const all = await listDocuments(scope === 'all' ? undefined : ctx.threadId);
      const hits = all.filter(d => `${d.name} ${d.body}`.toLowerCase().includes(needle));
      return hits.map(d => ({
        id: d.id,
        name: d.name,
        author: d.author,
        threadName: d.threadName,
        excerpt: excerpt(d.body, needle)
      }));
    }
  })
});

/** Write-side tools. Shared, because a worker's whole job is producing output. */
const writeTools = (ctx: ToolContext) => ({
  write_document: tool({
    description:
      'Write a new markdown document into this thread. Returns the id, which you can attach to a chat message.',
    inputSchema: z.object({
      name: z.string().describe('A short file name, e.g. "eval-protocol-v1".'),
      body: z.string().describe('The full markdown body.')
    }),
    execute: async ({ name, body }) => {
      const id = await uniqueId(documents, name);
      await db
        .insert(documents)
        .values({ id, name, threadId: ctx.threadId, authorId: ctx.agentId, body });
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
      name: z.string().optional().describe('A new name, if it should be renamed.')
    }),
    execute: async ({ id, body, name }) => {
      const doc = await getDocument(id);
      if (!doc) return { error: `No document with id "${id}".` };
      /** Thread-scoped on purpose: an agent revises its own thread's docs, not another's. */
      if (doc.threadId !== ctx.threadId)
        return { error: `Document "${id}" belongs to another thread.` };

      await db
        .update(documents)
        .set({
          body,
          ...(name ? { name } : {}),
          /** The same in-place bump the PATCH route does, so both paths agree. */
          version: sql`${documents.version} + 1`,
          updatedAt: new Date()
        })
        .where(eq(documents.id, id));

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
      await db.delete(documents).where(eq(documents.id, id));
      return { id, deleted: true };
    }
  }),

  send_chat_message: tool({
    description:
      'Say something to the group. This posts a message into the chat under your own name. ' +
      'Keep it short and conversational, the way a person talks in a group chat. ' +
      'You may call this more than once in a turn, then call finish when you have nothing left to add.',
    inputSchema: z.object({
      paragraphs: z
        .array(z.string())
        .describe('One or two short paragraphs. Not an essay. No preamble.'),
      docId: z
        .string()
        .optional()
        .describe('Optional id of a document to attach, from write_document.')
    }),
    execute: async ({ paragraphs, docId }) => {
      await appendMessage({
        threadId: ctx.threadId,
        authorId: ctx.agentId,
        paragraphs,
        tag: ctx.tag,
        docId
      });
      return { posted: true };
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
