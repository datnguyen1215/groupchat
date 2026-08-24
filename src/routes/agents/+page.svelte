<script lang="ts">
	import AgentCard from '$lib/components/AgentCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { orchestrator, researchAgents, spawnedAgents } from '$lib/data/agents';
</script>

<svelte:head><title>Agents · Group Chat</title></svelte:head>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto max-w-[1000px] px-[30px] pt-[34px] pb-[60px]">
		<PageHeader
			title="Agents"
			blurb="A fixed research roster. The orchestrator routes work to them and may spawn short-lived helpers underneath."
		>
			{#snippet actions()}
				<button class="rounded-lg border border-ink bg-ink px-[13px] py-[6px] text-[12.5px] font-semibold text-bg hover:bg-white">
					New agent
				</button>
			{/snippet}
		</PageHeader>

		<h2 class="mb-[11px] text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Orchestrator</h2>
		<div class="mb-[26px] grid grid-cols-1 gap-[11px]">
			<AgentCard agent={orchestrator} orchestrator />
		</div>

		<h2 class="mb-[11px] text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Research agents</h2>
		<div class="mb-[26px] grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-[11px]">
			{#each researchAgents as agent (agent.id)}
				<AgentCard {agent} />
			{/each}
		</div>

		<h2 class="mb-[11px] text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Spawned this session</h2>
		<div class="grid grid-cols-1 gap-[11px]">
			{#each spawnedAgents as agent (agent.id)}
				<AgentCard {agent} />
			{/each}
		</div>
	</div>
</div>
