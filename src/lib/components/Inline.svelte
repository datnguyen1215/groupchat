<script lang="ts">
  import { parseInline } from '$lib/markdown';

  type Props = { text: string };
  const { text }: Props = $props();

  const spans = $derived(parseInline(text));
</script>

<!-- prettier-ignore -->
{#each spans as span, i (i)}{#if span.code}<code
			class="rounded bg-line-2 px-[5px] py-px font-mono text-[12.5px] text-accent">{span.text}</code>{:else if span.bold}<b
			class="font-semibold text-ink">{span.text}</b>{:else}{span.text}{/if}{/each}
