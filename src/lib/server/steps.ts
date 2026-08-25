import type { StepGroup } from '$lib/data/threads';

type StepRow = {
  id: string;
  seq: number;
  groupLabel: string;
  state: 'ok' | 'run' | 'spawn' | 'say' | 'doc';
  name: string;
  detail: string;
  durationMs: number | null;
  parentId: string | null;
  badge: string | null;
};

const formatDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/**
 * A comment or a document write is instantaneous — it has no duration to miss,
 * so a null one means "not applicable", not "still going". Only a tool call
 * with no duration yet is actually running.
 */
const durationText = (state: StepRow['state'], ms: number | null) => {
  if (ms !== null) return formatDuration(ms);
  return state === 'say' || state === 'doc' ? '' : 'running';
};

/**
 * Collapses the step rows into the feed's runs. A run ends when the label
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
      duration: durationText(r.state, r.durationMs),
      child: Boolean(r.parentId),
      badge: r.badge ?? undefined
    };

    const last = groups.at(-1);
    if (last?.label === r.groupLabel) last.steps.push(step);
    else groups.push({ id: `g${r.seq}`, label: r.groupLabel, steps: [step] });
  }

  return groups;
};
