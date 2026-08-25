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

/**
 * The status line is a channel the prompt has to keep distinct from chat.
 * `CHAT_RULES` forbids saying what you are about to do, and the worker prompt
 * says nobody wants to hear which tools you ran — an agent applying those to
 * `set_status` stops calling it. These assert the exemption survives an edit.
 */
describe('status instructions reach both prompts', () => {
  const prompts = {
    orchestrator: orchestratorPrompt('Kestrel'),
    worker: workerPrompt('Wren', 'researcher', 'You find evidence.')
  };

  for (const [role, prompt] of Object.entries(prompts)) {
    it(`tells the ${role} to call set_status before each piece of work`, () => {
      expect(prompt).toMatch(/set_status before each piece of work/);
    });

    it(`tells the ${role} to keep the status current`, () => {
      expect(prompt).toMatch(/stale status/i);
    });

    it(`tells the ${role} the status is not chat`, () => {
      expect(prompt).toMatch(/It is not chat/);
    });

    /** Without this the no-preamble rule silences the status line too. */
    it(`exempts the ${role}'s status from the no-preamble rule`, () => {
      expect(prompt).toMatch(/no-preamble rule\s+is about chat/);
    });

    it(`tells the ${role} to name the work rather than the tool`, () => {
      expect(prompt).toMatch(/Name the work, not the tool/);
    });
  }
});

/**
 * A worker that skips `set_status` leaves its row blank for the whole turn, and
 * the worker prompt is where the pull the other way is strongest — it tells the
 * agent nobody wants to hear about its process. The instruction has to be
 * explicit about ordering, and has to name that exemption.
 */
describe('the worker is told to status first', () => {
  const prompt = workerPrompt('Wren', 'researcher', 'You find evidence.');

  it('makes set_status the first call of the turn', () => {
    expect(prompt).toMatch(/first call every turn is set_status/);
  });

  it('exempts the status line from the report-the-finding rule', () => {
    expect(prompt).toMatch(/status line is where the process goes/);
  });
});
