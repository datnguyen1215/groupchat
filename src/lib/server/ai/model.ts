import { createDeepSeek } from '@ai-sdk/deepseek';
import { env } from '$env/dynamic/private';

/**
 * Provider-side thinking is off everywhere.
 *
 * `deepseek-v4-flash` defaults to thinking enabled, so leaving this out means
 * paying reasoning tokens on every call for a trace nobody reads. The agents'
 * real reasoning is their tool calls, and those are already recorded in the
 * `steps` table and rendered by the activity drawer.
 *
 * Spread `noThinking` into every generateText call. There is no other place to
 * set it, so this is the one thing to audit.
 */
const deepseek = createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY });

export const chatModel = deepseek('deepseek-v4-flash');

export const noThinking = { deepseek: { thinking: { type: 'disabled' as const } } };

/** Both loops stop here. Reaching it means the model never called `finish`. */
export const MAX_STEPS = 50;
