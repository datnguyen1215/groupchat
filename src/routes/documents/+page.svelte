<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { documents } from '$lib/data/documents';
	import { threads } from '$lib/data/threads';
	import { overlay } from '$lib/state/overlay.svelte';

	const currentThread = threads[0];
	const inThread = documents.filter((doc) => doc.threadId === currentThread.id).length;

	let query = $state('');
	let active = $state('all');

	const filters = [
		{ id: 'all', label: `All ${documents.length}` },
		{ id: 'thread', label: `This thread ${inThread}` },
		{ id: 'recent', label: 'Recent' }
	];

	const matchesFilter = (doc: (typeof documents)[number]) => {
		if (active === 'thread') return doc.threadId === currentThread.id;
		/* Fixtures use a clock time for today and a word for older. */
		if (active === 'recent') return doc.updated.includes(':');
		return true;
	};

	const shown = $derived(
		documents.filter(
			(doc) =>
				matchesFilter(doc) &&
				(doc.name + doc.threadName + doc.author).toLowerCase().includes(query.trim().toLowerCase())
		)
	);
</script>

<svelte:head><title>Documents · Group Chat</title></svelte:head>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-[1000px] px-[30px] pt-[34px] pb-[60px]">
		<PageHeader
			title="Documents"
			blurb="Everything the agents wrote, across all threads. Long-form output lives here instead of in the chat."
		>
			{#snippet actions()}
				<button class="rounded-lg border border-ink bg-ink px-[13px] py-[6px] text-[12.5px] font-semibold text-bg hover:bg-white">
					New document
				</button>
			{/snippet}
		</PageHeader>

		<FilterBar
			placeholder="Search documents"
			{query}
			{filters}
			{active}
			onquery={(value) => (query = value)}
			onfilter={(id) => (active = id)}
		/>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-[13px]">
				<thead>
					<tr>
						{#each ['Name', 'Thread', 'Author', 'Updated', ''] as heading (heading)}
							<th class="border-b border-line px-3 pb-[9px] text-left text-[10.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
								{heading}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each shown as doc (doc.id)}
						<tr class="cursor-pointer hover:bg-panel" onclick={() => overlay.openDoc(doc.id)}>
							<td class="border-b border-line-2 px-3 py-[11px] font-medium tracking-[-0.005em]">
								▤ {doc.name}
							</td>
							<td class="border-b border-line-2 px-3 py-[11px] text-[12.5px] text-ink-2">{doc.threadName}</td>
							<td class="border-b border-line-2 px-3 py-[11px] text-[12.5px] text-ink-2">
								<span class="inline-flex items-center gap-[6px]">
									<Avatar initials={doc.authorInitials} color={doc.authorColor} size="xs" shape="circle" />
									{doc.author}
								</span>
							</td>
							<td class="border-b border-line-2 px-3 py-[11px] text-[12px] text-ink-3">{doc.updated}</td>
							<td class="border-b border-line-2 px-3 py-[11px] text-[12px] text-ink-3">{doc.version}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if shown.length === 0}
			<p class="mt-4 text-[13px] text-ink-3">No documents match.</p>
		{/if}
	</div>
</div>
