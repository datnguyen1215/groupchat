import { generateText, stepCountIs } from 'ai';
import { db } from '../db';
import { agents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { MAX_STEPS, chatModel, noThinking } from './model';
import { orchestratorPrompt, workerPrompt } from './prompts';
import { orchestratorTools, workerTools, type ToolContext } from './tools';
import { appendActivity, appendMessage, appendStep, listEntries, setAgentStatus } from '../repo';

/** Tool calls that are the agent talking, not the agent working. */
export const SPEECH = new Set(['send_chat_message', 'finish']);

/** The sparkline for one turn: a bar per working tool call, speech excluded. */
export const barsFor = (
  steps: { toolCalls?: { toolName: string }[] }[]
): ('ok' | 'run' | 'spawn')[] =>
  steps
    .flatMap(step => step.toolCalls ?? [])
    .filter(call => !SPEECH.has(call.toolName))
    .map(call => (call.toolName === 'run_agent' ? 'spawn' : 'ok'));

/**
 * The transcript the model sees. Activity strips are skipped — they summarise
 * tool runs the model already knows about, and feeding them back reads as noise.
 */
const transcript = async (threadId: string) => {
	const entries = await listEntries(threadId);
	return entries
		.filter((e) => e.kind === 'message')
		.map((e) => `${e.author}: ${e.paragraphs.join('\n')}`)
		.join('\n\n');
};

/**
 * Writes one agent's tool calls into `steps` and drops a collapsed strip into
 * the thread. Speech is excluded: `send_chat_message` already produced a
 * message entry, and showing it again as a tool call would double it up.
 */
const recordSteps = async (
	threadId: string,
	label: string,
	steps: { toolCalls?: { toolName: string; input: unknown }[] }[]
) => {
	const bars = barsFor(steps);
	if (!bars.length) return;

	const working = steps
		.flatMap((step) => step.toolCalls ?? [])
		.filter((call) => !SPEECH.has(call.toolName));

	for (const [i, call] of working.entries())
		await appendStep({
			threadId,
			groupLabel: label,
			state: bars[i],
			name: call.toolName,
			detail: detailOf(call.input),
			durationMs: null,
			badge: bars[i] === 'spawn' ? 'agent' : undefined
		});

	await appendActivity({ threadId, label: `${label} · ${bars.length} tools`, bars });
};

/** A one-line summary of a tool's input, for the drawer's detail column. */
export const detailOf = (input: unknown) => {
	if (!input || typeof input !== 'object') return '';
	const values = Object.values(input as Record<string, unknown>)
		.filter((v) => typeof v === 'string')
		.map((v) => v as string);
	const first = values[0] ?? '';
	return first.length > 80 ? `${first.slice(0, 77)}...` : first;
};

const agentRow = async (id: string) => {
	const [row] = await db.select().from(agents).where(eq(agents.id, id));
	return row ?? null;
};

/**
 * One worker turn. Blocks until the worker calls `finish` or hits the step cap,
 * then returns its report to whoever delegated the work.
 */
const runWorker = async (threadId: string, agentId: string, task: string) => {
	const agent = await agentRow(agentId);
	if (!agent) return `No agent with id "${agentId}".`;

	await setAgentStatus(agentId, 'busy', 'Working', threadId);

	try {
		const ctx: ToolContext = { threadId, agentId, tag: agent.role || 'agent' };
		const result = await generateText({
			model: chatModel,
			providerOptions: noThinking,
			system: workerPrompt(agent.name, agent.role, agent.description),
			prompt: `Here is the conversation so far:\n\n${await transcript(threadId)}\n\nYour task: ${task}`,
			tools: workerTools(ctx),
			stopWhen: stepCountIs(MAX_STEPS)
		});

		await recordSteps(threadId, agent.name, result.steps);

		/** `finish` leaves no text, so the last thing said in chat is the report. */
		return result.text.trim() || `${agent.name} finished the task.`;
	} catch (error) {
		/**
		 * Handed back as the report rather than rethrown: the orchestrator asked
		 * this agent for an answer, and "I failed" is an answer it can act on.
		 */
		console.error(`[agent loop] ${agent.name}`, error);
		return `${agent.name} could not finish — ${describe(error)}.`;
	} finally {
		/** Always. A stuck `busy` row is a presence indicator that never clears. */
		await setAgentStatus(agentId, 'idle', 'Idle');
	}
};

/**
 * One orchestrator turn, kicked off after the human posts. Runs to completion
 * in the background: nothing awaits it, and the browser sees the result on the
 * next refresh.
 */
export const runOrchestrator = async (threadId: string) => {
	const [orch] = await db.select().from(agents).where(eq(agents.kind, 'orchestrator'));
	if (!orch) return;

	await setAgentStatus(orch.id, 'busy', 'Thinking', threadId);

	try {
		const ctx: ToolContext = { threadId, agentId: orch.id, tag: 'orch' };
		const result = await generateText({
			model: chatModel,
			providerOptions: noThinking,
			system: orchestratorPrompt(orch.name),
			prompt: `Here is the conversation so far:\n\n${await transcript(threadId)}\n\nDecide what happens next.`,
			tools: orchestratorTools(ctx, (agentId, task) => runWorker(threadId, agentId, task)),
			stopWhen: stepCountIs(MAX_STEPS)
		});

		await recordSteps(threadId, orch.name, result.steps);
	} catch (error) {
		/**
		 * The turn is over and nobody is coming. Saying so in the thread is the
		 * only way the failure reaches the person who is waiting on a reply —
		 * there is no streaming channel to report it on.
		 */
		console.error('[agent loop]', error);
		await appendMessage({
			threadId,
			authorId: orch.id,
			tag: 'orch',
			paragraphs: [`I could not run this turn — ${describe(error)}. Nothing was lost; try again.`]
		});
	} finally {
		await setAgentStatus(orch.id, 'idle', 'Idle');
	}
};

/**
 * What the thread is allowed to say about a failure.
 *
 * Provider messages are never passed through. They quote request details back —
 * the auth error includes part of the API key — and whatever this returns is
 * stored as a message that anyone with access to the thread can read. So the
 * status code picks from fixed wording, and the real error goes to the log.
 */
export const describe = (error: unknown) => {
	const status = statusOf(error);

	if (status === 401 || status === 403) return 'the model provider rejected our credentials';
	if (status === 429) return 'the model provider is rate limiting us';
	if (status === 408 || status === 504) return 'the model provider timed out';
	if (status && status >= 500) return 'the model provider is having trouble';
	if (status && status >= 400) return 'the model provider rejected the request';

	return 'something went wrong on our side';
};

const statusOf = (error: unknown) => {
	if (!error || typeof error !== 'object') return null;
	const status = (error as { statusCode?: unknown }).statusCode;
	return typeof status === 'number' ? status : null;
};

/**
 * Detached on purpose. The composer's action returns as soon as the human's
 * message is stored; the agents keep working after the response is sent, and a
 * crash here must not take the request down with it.
 */
export const startTurn = (threadId: string) => {
	void runOrchestrator(threadId).catch((error) => {
		console.error('[agent loop]', error);
	});
};
