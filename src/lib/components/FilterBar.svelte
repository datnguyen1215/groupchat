<script lang="ts">
	import Icon from './Icon.svelte';

	type Filter = { id: string; label: string };
	type Props = {
		placeholder: string;
		query: string;
		filters: Filter[];
		active: string;
		onquery: (value: string) => void;
		onfilter: (id: string) => void;
	};

	const { placeholder, query, filters, active, onquery, onfilter }: Props = $props();
</script>

<div class="mb-[18px] flex flex-wrap items-center gap-[10px]">
	<div class="relative max-w-[320px] min-w-[200px] flex-1">
		<Icon name="search" class="absolute top-[9px] left-[10px] text-ink-3" />
		<input
			value={query}
			oninput={(event) => onquery(event.currentTarget.value)}
			{placeholder}
			class="w-full rounded-[9px] border border-line bg-panel py-[7px] pr-[11px] pl-[30px] text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-edge"
		/>
	</div>

	<div class="flex flex-wrap gap-[5px]">
		{#each filters as filter (filter.id)}
			<button
				class="rounded-full border border-line px-[11px] py-[5px] text-[12px] hover:border-ink-3 hover:text-ink-2"
				class:bg-panel-2={active === filter.id}
				class:border-edge={active === filter.id}
				class:text-ink={active === filter.id}
				class:font-medium={active === filter.id}
				class:text-ink-3={active !== filter.id}
				onclick={() => onfilter(filter.id)}
			>
				{filter.label}
			</button>
		{/each}
	</div>
</div>
