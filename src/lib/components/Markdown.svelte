<script lang="ts">
	import { parseMarkdown } from '$lib/markdown';
	import Inline from './Inline.svelte';

	type Props = { source: string };
	const { source }: Props = $props();

	const blocks = $derived(parseMarkdown(source));

	const headingClass = {
		1: 'text-[23px] font-[650] tracking-[-0.02em] text-ink mb-[15px]',
		2: 'text-[16.5px] font-[650] tracking-[-0.01em] text-ink mt-[30px] mb-[10px] pb-[7px] border-b border-line',
		3: 'text-[14px] font-[650] text-ink mt-[22px] mb-[7px]'
	};
</script>

<div class="max-w-[62ch] text-[14px]/[1.7] text-[#d6d6d4]">
	{#each blocks as block, i (i)}
		{#if block.type === 'heading'}
			<svelte:element this={`h${block.level}`} class={headingClass[block.level]}>
				<Inline text={block.text} />
			</svelte:element>
		{:else if block.type === 'paragraph'}
			<p class="mb-[14px]"><Inline text={block.text} /></p>
		{:else if block.type === 'list'}
			<ul class="mb-[14px] list-disc pl-[22px]">
				{#each block.items as item, j (j)}
					<li class="mb-[6px]"><Inline text={item} /></li>
				{/each}
			</ul>
		{:else if block.type === 'quote'}
			<blockquote class="mb-[14px] border-l-[2.5px] border-accent pl-[15px] text-ink-2">
				<Inline text={block.text} />
			</blockquote>
		{:else if block.type === 'code'}
			<pre class="mb-[15px] overflow-x-auto rounded-[9px] border border-line bg-[#0b0b0d] px-4 py-[14px]"><code
					class="font-mono text-[12px]/[1.65] text-[#c9c9c6]">{block.text}</code></pre>
		{:else if block.type === 'table'}
			<div class="mb-[15px] overflow-x-auto">
				<table class="w-full border-collapse text-[13px]">
					<thead>
						<tr>
							{#each block.head as cell, j (j)}
								<th class="border border-line bg-line-2 px-3 py-[7px] text-left text-[12px] font-semibold text-ink">
									<Inline text={cell} />
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each block.rows as row, j (j)}
							<tr>
								{#each row as cell, k (k)}
									<td class="border border-line px-3 py-[7px] text-left"><Inline text={cell} /></td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<hr class="my-6 h-px border-0 bg-line" />
		{/if}
	{/each}
</div>
