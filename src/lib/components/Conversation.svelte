<script lang="ts">
	import type { Doc } from '$lib/data/documents';
	import type { Entry } from '$lib/data/threads';
	import { page } from '$app/state';
	import { overlay } from '$lib/state/overlay.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import Inline from './Inline.svelte';

	type Props = { entries: Entry[]; onopenactivity: () => void };
	const { entries, onopenactivity }: Props = $props();

	const barColor = { ok: 'bg-ok', run: 'bg-run', spawn: 'bg-accent' };
</script>

<div class="flex-1 overflow-y-auto pt-[30px] pb-[10px]">
	<div class="mx-auto max-w-[620px] px-6">
		{#each entries as entry (entry.id)}
			{#if entry.kind === 'activity'}
				<div class="mb-5 pl-[30px]">
					<button
						class="inline-flex items-center gap-2 rounded-full border border-line bg-panel py-[5px] pr-3 pl-[10px] text-[12px] text-ink-3 hover:border-edge hover:text-ink-2"
						onclick={onopenactivity}
					>
						<span class="flex items-center gap-[2px]">
							{#each entry.bars as bar, i (i)}
								<i class="block h-[9px] w-[3px] rounded-sm {barColor[bar]}"></i>
							{/each}
						</span>
						{entry.label}
					</button>
				</div>
			{:else}
				<article class="mb-5">
					<header class="mb-[5px] flex items-center gap-2">
						<Avatar initials={entry.initials} color={entry.color} />
						<b class="text-[12.5px] font-semibold tracking-[-0.005em]">{entry.author}</b>
						{#if entry.tag}
							<span
								class="rounded-[5px] px-[6px] py-px text-[9.5px] font-semibold tracking-[0.04em] uppercase {entry.isOrchestrator
									? 'bg-accent/[0.13] text-accent'
									: 'bg-line-2 text-ink-3'}"
							>
								{entry.tag}
							</span>
						{/if}
						<span class="ml-auto text-[11px] text-ink-3">{entry.time}</span>
					</header>

					<div class="max-w-[56ch] pl-[30px] text-[13.5px] text-ink">
						{#each entry.paragraphs as paragraph, i (i)}
							<p class:mt-[7px]={i > 0}><Inline text={paragraph} /></p>
						{/each}

						{#if entry.docId}
							{@const doc = (page.data.documents as Doc[]).find((d) => d.id === entry.docId)}
							{#if doc}
								<button
									class="mt-2 inline-flex cursor-pointer items-center gap-[7px] rounded-lg border border-line bg-panel py-[6px] pr-[11px] pl-[9px] text-[12.5px] hover:border-edge hover:bg-panel-2"
									onclick={() => overlay.openDoc(doc.id)}
								>
									<Icon name="doc" />
									{doc.name}
									<span class="text-[11px] text-ink-3">{doc.size}</span>
								</button>
							{/if}
						{/if}
					</div>
				</article>
			{/if}
		{/each}
	</div>
</div>
