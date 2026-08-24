<script lang="ts">
  import Avatar from './Avatar.svelte';

  type Props = {
    name: string;
    initials: string;
    color: string;
    tag: string;
    statusLabel: string;
    lastStep: { name: string; detail: string } | null;
  };
  const { name, initials, color, tag, statusLabel, lastStep }: Props = $props();
</script>

<!--
	Not an entry. This is derived from `agents.status`, rendered after the message
	list, and it disappears when the turn ends and a real message takes its place.
	Keeping it out of the entry list is what stops a message being overwritten.
-->
<article class="mb-5">
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

  <div class="flex items-center gap-[9px] pl-[30px]">
    <span class="flex items-center gap-[3px]" aria-label="Working">
      {#each [0, 1, 2] as i (i)}
        <i class="dot block h-[5px] w-[5px] rounded-full bg-run" style:--delay="{i * 0.18}s"></i>
      {/each}
    </span>

    {#if lastStep}
      <span class="truncate font-mono text-[11.5px] text-ink-3">
        {lastStep.name}{lastStep.detail ? ` · ${lastStep.detail}` : ''}
      </span>
    {:else}
      <span class="text-[11.5px] text-ink-3">working…</span>
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
