<script lang="ts">
	import type { Agent } from '$lib/data/agents';
	import Avatar from './Avatar.svelte';

	type Props = { agent: Agent; orchestrator?: boolean };
	const { agent, orchestrator = false }: Props = $props();
</script>

<article
	class="rounded-[11px] border bg-panel p-4 hover:border-edge {orchestrator
		? 'border-accent/35 bg-gradient-to-b from-accent/[0.06] to-transparent'
		: 'border-line'}"
>
	<header class="mb-[11px] flex items-center gap-[11px]">
		<Avatar initials={agent.initials} color={agent.color} size="lg" />
		<div>
			<b class="block text-[13.5px] font-[650] tracking-[-0.01em]">{agent.name}</b>
			<span class="text-[11.5px] text-ink-3">{agent.role}</span>
		</div>
		<span
			class="ml-auto inline-flex flex-none items-center gap-[5px] rounded-full px-[9px] py-[2.5px] text-[10.5px] font-semibold {agent.status ===
			'busy'
				? 'bg-run/[0.14] text-run'
				: 'bg-line-2 text-ink-3'}"
		>
			{#if agent.status === 'busy'}
				<i class="h-[5px] w-[5px] rounded-full bg-run"></i>
			{/if}
			{agent.statusLabel}
		</span>
	</header>

	<p class="mb-[13px] text-[12.5px]/[1.58] text-ink-2">{agent.description}</p>

	{#if agent.skills.length > 0}
		<div class="mb-[13px] flex flex-wrap gap-[5px]">
			{#each agent.skills as skill (skill)}
				<span class="rounded-md bg-line-2 px-[7px] py-[2.5px] font-mono text-[10.5px] text-ink-2">
					{skill}
				</span>
			{/each}
		</div>
	{/if}

	<footer class="flex gap-[18px] border-t border-line-2 pt-3">
		{#each agent.stats as stat (stat.label)}
			<div class="text-[11px] text-ink-3">
				<b class="mb-px block text-[14.5px] font-[650] tracking-[-0.01em] text-ink">{stat.value}</b>
				{stat.label}
			</div>
		{/each}
	</footer>
</article>
