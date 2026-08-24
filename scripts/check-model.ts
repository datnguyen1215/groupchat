/**
 * One-shot check that the model still calls tools with thinking disabled.
 *
 * DeepSeek documents tool calling only for thinking-enabled mode, so this
 * intersection is undocumented and the whole agent loop depends on it. Run
 * after setting DEEPSEEK_API_KEY:
 *
 *   node --env-file-if-exists=.env node_modules/.bin/vite-node scripts/check-model.ts
 *
 * Expect a `get_weather` tool call and zero reasoning parts.
 */
import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });

const result = await generateText({
  model: deepseek('deepseek-v4-flash'),
  providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
  prompt: 'What is the weather in Hanoi? Use the tool, then say one short sentence.',
  tools: {
    get_weather: tool({
      description: 'Get the weather for a city.',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, tempC: 31 })
    })
  },
  stopWhen: stepCountIs(5)
});

console.log('toolCalls:', result.steps.flatMap(s => s.toolCalls ?? []).map(c => c.toolName));
console.log('reasoning parts:', result.steps.flatMap(s => s.content ?? []).filter((p: any) => p.type === 'reasoning').length);
console.log('text:', result.text);
