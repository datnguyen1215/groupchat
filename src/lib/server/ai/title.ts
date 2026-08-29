import { generateText } from 'ai';
import { chatModel, noThinking } from './model';
import { getThread, listEntries, titleThread } from '../repo';
import { logger, since } from '../logger';

const log = logger('title');

/** Long enough for a real subject, short enough for the sidebar's 230px. */
const MAX_LENGTH = 48;

const PROMPT = `
Name this conversation the way a person would name it in a chat sidebar.

- Plain English, words separated by spaces. It is a title, not a filename or a slug.
- Say what the conversation is about, not what kind of thing it is.
  "Webhook retries firing twice", not "Discussion about webhooks".
- Under ${MAX_LENGTH} characters. Six words is plenty.
- No quotes, no trailing period, no "Thread:" prefix.

Reply with the title alone. Nothing else.
`.trim();

/**
 * Models pad a one-line answer anyway — quotes, a stray prefix, a second line
 * explaining the first. Taking the first line and stripping the wrapper is
 * cheaper than another round trip, and a title that survives this is fine.
 */
const clean = (raw: string) => {
  const line = raw.trim().split('\n')[0] ?? '';
  const bare = line
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(title|thread)\s*:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  return bare.length > MAX_LENGTH ? `${bare.slice(0, MAX_LENGTH - 1).trimEnd()}…` : bare;
};

/**
 * Names a thread from what was said in it. Called once, at the end of the
 * orchestrator's first turn — by then the transcript holds both the question
 * and the answer, which is the most a title is ever going to get.
 *
 * Guarded on `titled` rather than on the name still being the default: a person
 * who renames a thread back to "New thread" has still made a choice, and this
 * must not overwrite it.
 */
export const generateTitle = async (threadId: string) => {
  const thread = await getThread(threadId);
  if (!thread) return;
  if (thread.titled) {
    log.debug({ threadId }, 'title skipped — already titled');
    return;
  }

  const entries = await listEntries(threadId);
  const transcript = entries
    .filter(e => e.kind === 'message')
    .map(e => `${e.author}: ${e.paragraphs.join('\n')}`)
    .join('\n\n');

  /** Nothing was said, so there is nothing to name it after. Try again next turn. */
  if (!transcript.trim()) {
    log.info({ threadId }, 'title skipped — empty transcript');
    return;
  }

  const start = Date.now();
  const result = await generateText({
    model: chatModel,
    providerOptions: noThinking,
    system: PROMPT,
    prompt: transcript
  });

  const name = clean(result.text);
  if (!name) {
    log.warn({ threadId, raw: result.text }, 'title empty after cleaning');
    return;
  }

  await titleThread(threadId, name);
  log.info({ threadId, threadName: name, ms: since(start) }, 'title generated');
};
