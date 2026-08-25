import type { StepGroup } from '$lib/data/threads';

type StepRow = {
  id: string;
  seq: number;
  groupLabel: string;
  state: 'ok' | 'run' | 'spawn';
  name: string;
  detail: string;
  durationMs: number | null;
  parentId: string | null;
  badge: string | null;
};

const formatDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/**
 * Collapses the step rows into the drawer's runs. A run ends when the label
 * changes, so one agent running twice with another agent in between yields two
 * groups carrying the same label.
 *
 * That is why a group has an `id` of its own. The label is a display string —
 * it repeats, so it can never be an `{#each}` key.
 */
export const groupSteps = (rows: StepRow[]): StepGroup[] => {
  const groups: StepGroup[] = [];

  for (const r of rows) {
    const step = {
      id: r.id,
      state: r.state,
      name: r.name,
      detail: r.detail,
      duration: r.durationMs === null ? 'running' : formatDuration(r.durationMs),
      child: Boolean(r.parentId),
      badge: r.badge ?? undefined
    };

    const last = groups.at(-1);
    if (last?.label === r.groupLabel) last.steps.push(step);
    else groups.push({ id: `g${r.seq}`, label: r.groupLabel, steps: [step] });
  }

  return groups;
};
