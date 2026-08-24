<script lang="ts">
	import { page } from '$app/state';
	import type { Skill } from '$lib/data/skills';
	import { overlay } from '$lib/state/overlay.svelte';
	import Markdown from './Markdown.svelte';
	import Modal from './Modal.svelte';

	const skill = $derived((page.data.skills as Skill[]).find((s) => s.id === overlay.skillId));

	let tab = $state<'about' | 'used-by'>('about');

	$effect(() => {
		if (skill) tab = 'about';
	});
</script>

{#if skill}
	<Modal
		title={skill.name}
		meta="Written by {skill.author} · {skill.updated} · {skill.version} · used {skill.uses}×"
		onclose={() => overlay.closeSkill()}
	>
		{#snippet body()}
			<div class="mb-6 flex gap-1 rounded-lg bg-line-2 p-[2.5px] w-fit">
				{#each [['about', 'About'], ['used-by', 'Used by']] as [id, label] (id)}
					<button
						class="rounded-md px-3 py-[4.5px] text-[11.5px] font-medium"
						class:bg-panel-2={tab === id}
						class:text-ink={tab === id}
						class:text-ink-3={tab !== id}
						onclick={() => (tab = id as typeof tab)}
					>
						{label}
					</button>
				{/each}
			</div>

			{#if tab === 'about'}
				<Markdown source={skill.body} />
			{:else}
				<p class="mb-4 max-w-[62ch] text-[13.5px]/[1.7] text-ink-2">
					Skills are global, but attachment is per agent. These agents currently have
					<code class="rounded bg-line-2 px-[5px] py-px font-mono text-[12.5px] text-accent">{skill.name}</code>
					attached.
				</p>
				<ul class="flex flex-col gap-2">
					{#each skill.usedBy as agent (agent)}
						<li class="rounded-[9px] border border-line px-3 py-[9px] text-[13px]">{agent}</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
		{#snippet footer()}
			<button class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink">Edit</button>
			<button class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink">Ask agent to revise</button>
			<button class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink">Duplicate</button>
		{/snippet}
	</Modal>
{/if}
