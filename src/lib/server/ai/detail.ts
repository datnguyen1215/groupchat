/**
 * Tool calls that are the agent talking, not the agent working. Speech is
 * already an entry in the thread, so it is left out of the step rows and the
 * sparkline.
 *
 * Here rather than in `loop.ts` for the same reason `detailOf` is: `tools.ts`
 * needs it too, and `loop.ts` already imports `tools.ts`.
 */
export const SPEECH = new Set(['send_chat_message', 'finish']);

/**
 * A one-line summary of a tool's input: the activity drawer's detail column,
 * and the same summary the tool log carries at `info`.
 *
 * Its own module because both `loop.ts` and `tools.ts` need it, and `loop.ts`
 * already imports `tools.ts` — leaving it in either one would make a cycle.
 */
export const detailOf = (input: unknown) => {
  if (!input || typeof input !== 'object') return '';
  const values = Object.values(input as Record<string, unknown>)
    .filter(v => typeof v === 'string')
    .map(v => v as string);
  const first = values[0] ?? '';
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
};
