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
});
