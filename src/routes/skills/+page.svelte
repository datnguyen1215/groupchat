<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { overlay } from '$lib/state/overlay.svelte';

	const { data } = $props();
	const skills = $derived(data.skills);

	let query = $state('');
	let active = $state('all');

	const mine = $derived(skills.filter((s) => s.authoredBy === 'you').length);
	const byAgents = $derived(skills.filter((s) => s.authoredBy === 'agent').length);

	const filters = $derived([
		{ id: 'all', label: `All ${skills.length}` },
		{ id: 'mine', label: `Mine ${mine}` },
		{ id: 'agent', label: `Agent-authored ${byAgents}` },
		{ id: 'recent', label: 'Recently used' }
	]);

	const matchesFilter = (skill: (typeof skills)[number]) => {
		if (active === 'mine') return skill.authoredBy === 'you';
		if (active === 'agent') return skill.authoredBy === 'agent';
		if (active === 'recent') return skill.uses > 5;
		return true;
	};

	const shown = $derived(
		skills.filter(
			(skill) =>
				matchesFilter(skill) &&
				(skill.name + skill.description).toLowerCase().includes(query.trim().toLowerCase())
		)
	);
</script>

<svelte:head><title>Skills · Group Chat</title></svelte:head>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-[1000px] px-[30px] pt-[34px] pb-[60px]">
		<PageHeader
			title="Skills"
			blurb="Procedures the orchestrator searches before it delegates. Agents write and revise them; so can you."
		>
			{#snippet actions()}
				<button class="rounded-lg border border-line px-[13px] py-[6px] text-[12.5px] font-medium text-ink-2 hover:bg-panel-2 hover:text-ink">
					Import
				</button>
				<button class="rounded-lg border border-ink bg-ink px-[13px] py-[6px] text-[12.5px] font-semibold text-bg hover:bg-white">
					New skill
				</button>
			{/snippet}
		</PageHeader>

		<FilterBar
			placeholder="Search skills"
			{query}
			{filters}
			{active}
			onquery={(value) => (query = value)}
			onfilter={(id) => (active = id)}
		/>

		<div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[11px]">
			{#each shown as skill (skill.id)}
				<button
					class="flex cursor-pointer flex-col rounded-[11px] border border-line bg-panel px-4 py-[15px] text-left hover:border-edge hover:bg-panel-2"
					onclick={() => overlay.openSkill(skill.id)}
				>
					<span class="mb-2 flex items-center gap-[9px]">
						<span class="grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-violet/[0.14] text-[11px] text-violet">◈</span>
						<span class="font-mono text-[12.5px] font-semibold tracking-[-0.02em]">{skill.name}</span>
						<span class="ml-auto rounded-full bg-line-2 px-[6px] py-[1.5px] font-mono text-[10px] text-ink-3">
							{skill.version}
						</span>
					</span>

					<span class="mb-[13px] flex-1 text-[12.5px]/[1.58] text-ink-2">{skill.description}</span>

					<span class="flex items-center gap-[6px] border-t border-line-2 pt-[11px] text-[11px] text-ink-3">
						<Avatar initials={skill.authorInitials} color={skill.authorColor} size="xs" shape="circle" />
						{skill.author} · {skill.updated}
						<span class="ml-auto font-mono text-[10.5px]">
							{skill.uses} {skill.uses === 1 ? 'use' : 'uses'}
						</span>
					</span>
				</button>
			{/each}
		</div>

		{#if shown.length === 0}
			<p class="text-[13px] text-ink-3">No skills match.</p>
		{/if}
	</div>
</div>
