import { generateText, stepCountIs } from 'ai';
import { db } from '../db';
import { agents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { MAX_STEPS, chatModel, noThinking } from './model';
import { orchestratorPrompt, workerPrompt } from './prompts';
import { orchestratorTools, workerTools, type ToolContext } from './tools';
import {
  BLOCKED,
  appendError,
  appendStep,
  listEntries,
  setAgentStatus
} from '../repo';
import { logger, since } from '../logger';
import { summarise } from './detail';

const log = logger('agent');

/**
 * `finish` is the agent ending its turn, not doing anything. It is the only
 * tool call the feed drops — everything else an agent does is something a
 * reader might want to see.
 */
export const SILENT = new Set(['finish']);

/**
 * How one tool call reads in the feed: its state, and the name shown against
 * it. Working calls keep their tool name in mono; the three an agent is
 * *judged* by — talking, writing, revising — get a sentence instead, because
 * "Wren commented" is what the reader is scanning for, not `send_chat_message`.
 */
const FEED = {
  send_chat_message: { state: 'say', verb: 'commented' },
  write_document: { state: 'doc', verb: 'wrote document' },
  update_document: { state: 'doc', verb: 'updated document' },
  run_agent: { state: 'spawn', verb: null }
} as const;

export type FeedState = 'ok' | 'run' | 'spawn' | 'say' | 'doc';

/** The state one tool call carries in the feed. */
export const stateFor = (toolName: string): FeedState =>
  FEED[toolName as keyof typeof FEED]?.state ?? 'ok';

/**
 * The name shown against one call. A sentence for the three that read as the
 * agent acting in the thread, the raw tool name for the rest.
 */
export const nameFor = (agentName: string, toolName: string) => {
  const verb = FEED[toolName as keyof typeof FEED]?.verb;
  return verb ? `${agentName} ${verb}` : toolName;
};

/**
 * The transcript the model sees. Activity strips are skipped — they summarise
 * tool runs the model already knows about, and feeding them back reads as noise.
 */
const transcript = async (threadId: string) => {
  const entries = await listEntries(threadId);
  return entries
    .filter(e => e.kind === 'message')
    .map(e => `${e.author}: ${e.paragraphs.join('\n')}`)
    .join('\n\n');
};

/**
 * Writes one agent's turn into `steps` — the whole turn, not just the tools.
 * A comment, a document write and a search all land here in the order they
 * happened, because the feed is the one place that answers "what went on in
 * this thread".
 *
 * The chat stream still carries the comment itself; this row is the same event
 * seen from the activity side, which is why it holds only a summary of it.
 */
const recordSteps = async (
  threadId: string,
  label: string,
  steps: { toolCalls?: { toolName: string; input: unknown }[] }[]
) => {
  const calls = steps
    .flatMap(step => step.toolCalls ?? [])
    .filter(call => !SILENT.has(call.toolName));

  for (const call of calls) {
    const state = stateFor(call.toolName);
    await appendStep({
      threadId,
      groupLabel: label,
      state,
      name: nameFor(label, call.toolName),
      detail: summarise(call.input),
      durationMs: null,
      badge: state === 'spawn' ? 'agent' : undefined
    });
  }
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
  if (!agent) {
    log.warn({ agentId, threadId }, 'worker not found');
    return `No agent with id "${agentId}".`;
  }

  await setAgentStatus(agentId, 'busy', 'Working', threadId);
  const start = Date.now();
  log.info({ agentId, agentName: agent.name, threadId, task }, 'worker start');

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
    log.info(
      {
        agentId,
        agentName: agent.name,
        threadId,
        steps: result.steps.length,
        tools: result.steps.flatMap(s => s.toolCalls ?? []).map(c => c.toolName),
        finish: result.finishReason,
        tokens: result.usage?.totalTokens,
        ms: since(start)
      },
      'worker done'
    );

    /** `finish` leaves no text, so the last thing said in chat is the report. */
    return result.text.trim() || `${agent.name} finished the task.`;
  } catch (error) {
    log.error(
      { agentId, agentName: agent.name, threadId, ms: since(start), err: error },
      'worker failed'
    );

    /** Shown in its own right, so the failure reaches the thread unparaphrased. */
    await appendError({ threadId, line: `${agent.name} stopped — ${describe(error)}` });

    /**
     * Also handed back as the report rather than rethrown: the orchestrator
     * asked this agent for an answer, and "I failed" is one it can act on.
     */
    return `${agent.name} could not finish — ${describe(error)}.`;
  } finally {
    /** Always. A stuck `busy` row is a presence indicator that never clears. */
    await setAgentStatus(agentId, 'idle', 'Idle');
  }
};

/**
 * Hides the orchestrator's presence row for as long as it is waiting on a
 * delegate.
 *
 * The row is the problem this solves: `run_agent` blocks, so the orchestrator
 * holds a `busy` row for the whole of every delegated turn while doing nothing
 * a reader can act on. Left visible it sits alongside the workers labelled the
 * same way they are, which reads as one more agent working.
 *
 * The count matters because the model can emit several `run_agent` calls in one
 * step and the SDK runs them concurrently. Restoring the label when any single
 * worker returns would put the row back while the others are still going, so
 * only the last one out clears it.
 */
const inFlight = new Map<string, number>();

export const delegating = async <T>(agentId: string, threadId: string, run: () => Promise<T>) => {
  const held = inFlight.get(agentId) ?? 0;
  inFlight.set(agentId, held + 1);
  if (!held) await setAgentStatus(agentId, 'busy', BLOCKED, threadId);

  try {
    return await run();
  } finally {
    const left = (inFlight.get(agentId) ?? 1) - 1;
    if (left) inFlight.set(agentId, left);
    else {
      inFlight.delete(agentId);
      /**
       * Back to composing, which is real work and gets a row again. Still
       * `busy`: the turn is not over, and going idle here would drop the row
       * that `runOrchestrator`'s own `finally` is responsible for.
       */
      await setAgentStatus(agentId, 'busy', 'Thinking', threadId);
    }
  }
};

/**
 * One orchestrator turn, kicked off after the human posts. Runs to completion
 * in the background: nothing awaits it, and the browser sees the result on the
 * next refresh.
 */
export const runOrchestrator = async (threadId: string) => {
  const [orch] = await db.select().from(agents).where(eq(agents.kind, 'orchestrator'));
  if (!orch) {
    log.error({ threadId }, 'no orchestrator agent — turn skipped');
    return;
  }

  await setAgentStatus(orch.id, 'busy', 'Thinking', threadId);
  const start = Date.now();
  log.info({ agentId: orch.id, agentName: orch.name, threadId }, 'turn start');

  try {
    const ctx: ToolContext = { threadId, agentId: orch.id, tag: 'orch' };
    const result = await generateText({
      model: chatModel,
      providerOptions: noThinking,
      system: orchestratorPrompt(orch.name),
      prompt: `Here is the conversation so far:\n\n${await transcript(threadId)}\n\nDecide what happens next.`,
      tools: orchestratorTools(ctx, (agentId, task) =>
        delegating(orch.id, threadId, () => runWorker(threadId, agentId, task))
      ),
      stopWhen: stepCountIs(MAX_STEPS)
    });

    await recordSteps(threadId, orch.name, result.steps);
    log.info(
      {
        agentId: orch.id,
        threadId,
        steps: result.steps.length,
        tools: result.steps.flatMap(s => s.toolCalls ?? []).map(c => c.toolName),
        finish: result.finishReason,
        tokens: result.usage?.totalTokens,
        ms: since(start)
      },
      'turn done'
    );
  } catch (error) {
    /**
     * The turn is over and nobody is coming, so the failure has to land in the
     * thread — it is the only way it reaches the person waiting on a reply.
     * As an error entry, not a message: the orchestrator did not choose to say
     * this, and dressing a crash up as its speech misreads what happened.
     */
    log.error({ agentId: orch.id, threadId, ms: since(start), err: error }, 'turn failed');
    await appendError({ threadId, line: sentence(describe(error)) });
  } finally {
    await setAgentStatus(orch.id, 'idle', 'Idle');
  }
};

/**
 * What the thread is allowed to say about a failure.
 *
 * Provider messages are never passed through. They quote request details back —
 * the auth error includes part of the API key — and whatever this returns is
 * stored on an entry that anyone with access to the thread can read. So the
 * status code picks from fixed wording, and the real error goes to the log.
 *
 * Returns a lowercase fragment: it is both the error entry's line and the tail
 * of the report handed back to the orchestrator. `sentence` caps it for display.
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

/** A fragment from `describe` as a standalone line. */
export const sentence = (fragment: string) => fragment.charAt(0).toUpperCase() + fragment.slice(1);

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
  log.info({ threadId }, 'turn queued');
  void runOrchestrator(threadId).catch(error => {
    log.error({ threadId, err: error }, 'detached turn crashed');
  });
};
