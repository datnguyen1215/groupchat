/**
/**
 * Tool calls the feed drops. `finish` is the agent ending its turn, not doing
 * anything. `set_status` is the agent captioning the work rather than doing it
 * — its title already renders on the presence row, and recording it as a step
 * too would bury the real steps under a running commentary on them.
 *
 * Everything else an agent does is something a reader might want to see.
 *
 * Here rather than in `loop.ts` for the same reason `summarise` is: `tools.ts`
 * needs it too, and `loop.ts` already imports `tools.ts`.
 */
export const SILENT = new Set(['finish', 'set_status']);

/**
 * A one-line summary of a tool's input: the activity feed's detail column, and
 * the same summary the tool log carries at `info`.
 *
 * Its own module because both `loop.ts` and `tools.ts` need it, and `loop.ts`
 * already imports `tools.ts` — leaving it in either one would make a cycle.
 */

const LIMIT = 80;

const clip = (text: string) => (text.length > LIMIT ? `${text.slice(0, LIMIT - 3)}...` : text);

/** The first string argument, clipped to one line. */
export const detailOf = (input: unknown) => {
  if (!input || typeof input !== 'object') return '';
  const first = Object.values(input as Record<string, unknown>).find(v => typeof v === 'string');
  return typeof first === 'string' ? clip(first) : '';
};

/**
 * `detailOf`, falling back to the first array of strings.
 *
 * The fallback is what makes a comment row readable: `send_chat_message`
 * carries `{ paragraphs: [...] }` and no plain string, so `detailOf` alone
 * would leave the one row worth reading blank.
 */
export const summarise = (input: unknown) => {
  const direct = detailOf(input);
  if (direct || !input || typeof input !== 'object') return direct;

  const joined = Object.values(input as Record<string, unknown>)
    .filter((v): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string'))
    .map(v => v.join(' '))
    .find(Boolean);

  return joined ? clip(joined) : '';
};

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
