<script lang="ts">
  import Avatar from './Avatar.svelte';

  type Step = { id: string; name: string; detail: string; durationMs: number | null };

  type Props = {
    name: string;
    initials: string;
    color: string;
    tag: string;
    statusLabel: string;
    statusTitle: string | null;
    steps: Step[];
  };
  const { name, initials, color, tag, statusLabel, statusTitle, steps }: Props = $props();

  /** Whole seconds. The row is a glance, and `4.132s` reads as precision it does not have. */
  const took = (ms: number | null) => (ms === null ? '' : `${Math.max(1, Math.round(ms / 1000))}s`);
</script>

<!--
	Not an entry. This is derived from `agents.status`, rendered after the message
	list, and it disappears when the turn ends and a real message takes its place.
	Keeping it out of the entry list is what stops a message being overwritten.
-->
<article class="mb-5" aria-label="Presence: {name}">
  <header class="mb-[5px] flex items-center gap-2">
    <Avatar {initials} {color} />
    <b class="text-[12.5px] font-semibold tracking-[-0.005em]">{name}</b>
    {#if tag}
      <span
        class="rounded-[5px] bg-line-2 px-[6px] py-px text-[9.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase"
      >
        {tag}
      </span>
    {/if}
    <span class="ml-auto text-[11px] text-ink-3">{statusLabel}</span>
  </header>

  <div class="pl-[30px]">
    <div class="flex items-center gap-[9px]">
      <span class="flex items-center gap-[3px]" aria-label="Working">
        {#each [0, 1, 2] as i (i)}
          <i class="dot block h-[5px] w-[5px] rounded-full bg-run" style:--delay="{i * 0.18}s"></i>
        {/each}
      </span>

      <!--
				The agent's own words when it has given them, the last thing it did when
				it has not. Falling back to the step keeps the line populated through the
				stretch before the first `set_status` call of a turn.
			-->
      {#if statusTitle}
        <span class="truncate text-[12.5px] text-ink">{statusTitle}</span>
      {:else if steps.length}
        <span class="truncate font-mono text-[11.5px] text-ink-3">
          {steps[steps.length - 1].name}
        </span>
      {:else}
        <span class="text-[11.5px] text-ink-3">working…</span>
      {/if}
    </div>

    <!-- Finished work, oldest first. Capped server-side; see `PRESENCE_STEPS`. -->
    {#if statusTitle && steps.length}
      <ul class="mt-[7px] space-y-px" aria-label="Finished steps">
        {#each steps as step (step.id)}
          <li class="flex items-baseline gap-2 text-[11.5px] text-ink-3">
            <span class="text-ok" aria-hidden="true">✓</span>
            <span class="truncate">{step.name}{step.detail ? ` · ${step.detail}` : ''}</span>
            {#if step.durationMs !== null}
              <span class="ml-auto shrink-0 font-mono text-[10.5px] text-edge">
                {took(step.durationMs)}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</article>

<style>
  /* CSS-only. There is no polling, so this signals "still going", not progress. */
  .dot {
    animation: pulse 1.4s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes pulse {
    0%,
    60%,
    100% {
      opacity: 0.25;
    }
    30% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
      opacity: 0.6;
    }
  }
</style>
