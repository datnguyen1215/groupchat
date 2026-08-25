import { describe, expect, it } from 'vitest';
import { orchestratorPrompt, workerPrompt } from '../../src/lib/server/ai/prompts';

/**
 * Both roles write documents, so both need the same naming rule. The rule
 * lives in one shared block — these assert it actually reaches each prompt,
 * because a block that stops being interpolated fails silently otherwise.
 */
describe('document naming reaches both prompts', () => {
  const prompts = {
    orchestrator: orchestratorPrompt('Kestrel'),
    worker: workerPrompt('Wren', 'researcher', 'You find evidence.')
  };

  for (const [role, prompt] of Object.entries(prompts)) {
    it(`tells the ${role} to title documents in plain English`, () => {
      expect(prompt).toContain('plain English');
      expect(prompt).toMatch(/separated by spaces/);
    });

    it(`shows the ${role} a spaced example and the kebab-case one to avoid`, () => {
      expect(prompt).toContain('"Eval Protocol v1"');
      expect(prompt).toContain('"eval-protocol-v1"');
    });

    it(`tells the ${role} a document name is not a filename`, () => {
      expect(prompt).toMatch(/not a filename/i);
    });
  }
});
