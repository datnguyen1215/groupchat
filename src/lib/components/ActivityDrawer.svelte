<script lang="ts">
  import type { StepGroup } from '$lib/data/threads';

  type Props = { groups: StepGroup[]; count: number; open: boolean; onclose: () => void };
  const { groups, count, open, onclose }: Props = $props();

  const dot = {
    ok: 'bg-ok',
    run: 'bg-run',
    spawn: 'bg-accent',
    say: 'bg-ink-3',
    doc: 'bg-violet'
  };
  const glyph = { ok: '✓', run: '•', spawn: '↳', say: '”', doc: '▤' };

  /**
   * Comments and document writes carry a sentence — "Wren commented" — so they
   * read as prose. Tool calls keep the mono tool name, which is what makes the
   * two skimmable apart without a filter.
   */
  const prose = (state: string) => state === 'say' || state === 'doc';
</script>

<section
  class="on-panel flex-none overflow-hidden border-t border-line bg-panel transition-[height] duration-200 ease-out"
  class:h-0={!open}
  class:h-[262px]={open}
  aria-label="Activity"
>
  <header class="flex h-10 items-center gap-[9px] border-b border-line-2 px-5">
    <b class="text-[12px] font-semibold">Activity</b>
    <span class="rounded-full bg-line-2 px-[7px] py-[1.5px] font-mono text-[10.5px] text-ink-3">
      {count} events
    </span>
    <button
      class="ml-auto h-6 w-6 rounded-md text-[17px] leading-none text-ink-3 hover:bg-panel-2 hover:text-ink"
      onclick={onclose}
      aria-label="Close activity"
    >
      ×
    </button>
  </header>

  <div class="h-[222px] overflow-y-auto px-5 pt-3 pb-5">
    {#each groups as group, g (group.id)}
      <h3
        class="pb-[5px] pl-[26px] text-[10px] font-semibold tracking-[0.07em] text-ink-3 uppercase"
        class:pt-[10px]={g > 0}
      >
        {group.label}
      </h3>

      {#each group.steps as step, i (step.id)}
        <div class="relative mb-[2px] {step.child ? 'pl-[52px]' : 'pl-[26px]'}">
          {#if i < group.steps.length - 1}
            <span
              class="absolute top-[19px] -bottom-[4px] w-[1.5px] bg-line"
              style:left={step.child ? '32px' : '6px'}
            ></span>
          {/if}
          <span
            class="absolute top-[5px] grid h-[13px] w-[13px] place-items-center rounded-full text-[7.5px] font-extrabold text-bg {dot[
              step.state
            ]}"
            style:left={step.child ? '26px' : '0'}
          >
            {glyph[step.state]}
          </span>

          <div
            class="flex items-center gap-[10px] rounded-[7px] px-[9px] py-[9px] hover:bg-panel-2"
          >
            <span
              class:font-mono={!prose(step.state)}
              class:tracking-[-0.02em]={!prose(step.state)}
              class:font-semibold={prose(step.state)}
              class="text-[11.5px] whitespace-nowrap"
            >
              {step.name}
            </span>
            {#if step.badge}
              <span
                class="rounded bg-accent/[0.13] px-[5px] py-px text-[9px] font-bold tracking-[0.04em] text-accent uppercase"
              >
                {step.badge}
              </span>
            {/if}
            <span class="flex-1 truncate text-[11.5px] text-ink-3">{step.detail}</span>
            <span class="font-mono text-[10.5px] text-ink-3">{step.duration}</span>
          </div>
        </div>
      {/each}
    {/each}

    {#if groups.length === 0}
      <p class="pl-[26px] text-[12px] text-ink-3">No activity in this thread.</p>
    {/if}
  </div>
</section>
