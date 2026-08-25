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
