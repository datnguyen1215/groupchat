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

/** Read-side tools. Both the orchestrator and the workers get these. */
const readTools = (ctx: ToolContext) => ({
	list_skills: tool({
		description: 'List every skill available, with its id and description.',
		inputSchema: z.object({}),
		execute: async () => {
			const all = await listSkills();
			return all.map((s) => ({ id: s.id, name: s.name, description: s.description }));
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
			return all.map((d) => ({ id: d.id, name: d.name, author: d.author }));
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
export const workerTools = (ctx: ToolContext) => ({
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
) => ({
	...readTools(ctx),
	...writeTools(ctx),

	list_agents: tool({
		description: 'List the agents you can delegate work to.',
		inputSchema: z.object({}),
		execute: async () => {
			const all = await listAgents('research');
			return all.map((a) => ({
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
