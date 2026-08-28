import { describe, expect, it } from 'vitest';
import { groupSteps } from '../../src/lib/server/steps';

const row = (seq: number, groupLabel: string, over: Record<string, unknown> = {}) => ({
  id: `s${seq}`,
  seq,
  groupLabel,
  state: 'ok' as const,
  name: 'search',
  detail: '',
  durationMs: 120,
  parentId: null,
  badge: null,
  ...over
});

describe('groupSteps', () => {
  it('returns nothing for no rows', () => {
    expect(groupSteps([])).toEqual([]);
  });

  it('collapses consecutive rows with the same label into one group', () => {
    const groups = groupSteps([row(1, 'Wren'), row(2, 'Wren')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].steps).toHaveLength(2);
  });

  it('starts a new group when the label changes', () => {
    const groups = groupSteps([row(1, 'Wren'), row(2, 'Kestrel')]);

    expect(groups.map(g => g.label)).toEqual(['Wren', 'Kestrel']);
  });

  /**
   * The regression. Wren runs, Kestrel runs, Wren runs again — two groups carry
   * the label `Wren`, so the label cannot be the drawer's `{#each}` key.
   */
  it('gives a repeating agent a separate group each run', () => {
    const groups = groupSteps([row(1, 'Wren'), row(2, 'Kestrel'), row(3, 'Wren')]);

    expect(groups.map(g => g.label)).toEqual(['Wren', 'Kestrel', 'Wren']);
  });

  it('gives every group a unique id even when labels repeat', () => {
    const groups = groupSteps([
      row(1, 'Wren'),
      row(2, 'Kestrel'),
      row(3, 'Wren'),
      row(4, 'Kestrel'),
      row(5, 'Wren')
    ]);

    const ids = groups.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The crash. Concurrent appends wrote the same `seq` to one thread, so a group
   * id derived from `seq` repeated and the drawer threw `each_key_duplicate`.
   * The id comes off the row's own UUID now, which duplicate `seq` cannot touch.
   */
  it('gives every group a unique id even when seq repeats', () => {
    const groups = groupSteps([
      row(59, 'Wren', { id: 'a' }),
      row(59, 'Kestrel', { id: 'b' }),
      row(59, 'Wren', { id: 'c' })
    ]);

    const ids = groups.map(g => g.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('formats a running step and a finished one', () => {
    const groups = groupSteps([
      row(1, 'Wren', { durationMs: null, state: 'run' }),
      row(2, 'Wren', { durationMs: 2500 })
    ]);

    expect(groups[0].steps.map(s => s.duration)).toEqual(['running', '2.5s']);
  });

  it('marks a row with a parent as a child', () => {
    const groups = groupSteps([row(1, 'Wren', { parentId: 's0' })]);

    expect(groups[0].steps[0].child).toBe(true);
  });

  /**
   * The feed carries comments and document writes alongside tool calls. Those
   * happen instantly, so a null duration means "not applicable" — showing
   * `running` against a comment claims the agent is still talking.
   */
  it('leaves a comment and a document write with no duration', () => {
    const groups = groupSteps([
      row(1, 'Wren', { state: 'say', name: 'Wren commented', durationMs: null }),
      row(2, 'Wren', { state: 'doc', name: 'Wren wrote document', durationMs: null })
    ]);

    expect(groups[0].steps.map(s => s.duration)).toEqual(['', '']);
  });

  it('still shows a tool call with no duration as running', () => {
    const groups = groupSteps([row(1, 'Wren', { state: 'ok', durationMs: null })]);

    expect(groups[0].steps[0].duration).toBe('running');
  });

  it('groups a comment with the tool calls around it, on one clock', () => {
    const groups = groupSteps([
      row(1, 'Wren', { state: 'ok', name: 'web_search' }),
      row(2, 'Wren', { state: 'say', name: 'Wren commented', durationMs: null }),
      row(3, 'Wren', { state: 'doc', name: 'Wren wrote document', durationMs: null })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].steps.map(s => s.state)).toEqual(['ok', 'say', 'doc']);
  });
});
