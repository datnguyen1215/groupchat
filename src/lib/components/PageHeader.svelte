<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = { title: string; blurb: string; actions?: Snippet };
  const { title, blurb, actions }: Props = $props();
</script>

<div class="mb-6 flex items-start gap-4">
  <div>
    <h1 class="text-[21px] font-[650] tracking-[-0.02em]">{title}</h1>
    <p class="mt-[6px] max-w-[60ch] text-[13px]/[1.6] text-ink-2">{blurb}</p>
  </div>
  <div class="flex-1"></div>
  {#if actions}{@render actions()}{/if}
</div>
