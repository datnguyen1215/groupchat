<script lang="ts">
	import ActivityDrawer from '$lib/components/ActivityDrawer.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import Conversation from '$lib/components/Conversation.svelte';
	import DocsSidebar from '$lib/components/DocsSidebar.svelte';
	import ThreadList from '$lib/components/ThreadList.svelte';
	import { stepCount } from '$lib/data/threads';

	const { data } = $props();

	const thread = $derived(data.thread);
	const steps = $derived(stepCount(thread));
	const threadDocs = $derived(data.documents.filter((doc) => thread.docIds.includes(doc.id)));

	let activityOpen = $state(false);
	let docsOpen = $state(false);

	/* Panels are per-thread affordances; collapse them when the thread changes. */
	$effect(() => {
		thread.id;
		activityOpen = false;
		docsOpen = false;
	});
</script>

<svelte:head><title>{thread.name} · Group Chat</title></svelte:head>

<ThreadList />

<div class="flex min-h-0 min-w-0 flex-1 flex-col">
	<header class="flex h-[52px] flex-none items-center gap-[14px] border-b border-line px-5">
		<h1 class="text-[14.5px] font-semibold tracking-[-0.01em]">{thread.name}</h1>
		<span class="text-[12px] text-ink-3">{thread.participants.length} agents</span>
		<div class="flex-1"></div>

		<div class="flex">
			{#each thread.participants as agent, i (agent.initials)}
				<span
					class="grid h-[23px] w-[23px] place-items-center rounded-full border-2 border-bg text-[9px] font-bold text-bg"
					style:background={agent.color}
					style:margin-left={i === 0 ? '0' : '-7px'}
				>
					{agent.initials}
				</span>
			{/each}
		</div>

		<button
			class="rounded-[7px] border border-line px-[11px] py-[5px] text-[12.5px] text-ink-2 hover:border-ink-3 hover:text-ink"
			class:bg-panel-2={activityOpen}
			class:text-ink={activityOpen}
			onclick={() => (activityOpen = !activityOpen)}
		>
			Activity · {steps}
		</button>
		<button
			class="rounded-[7px] border border-line px-[11px] py-[5px] text-[12.5px] text-ink-2 hover:border-ink-3 hover:text-ink"
			class:bg-panel-2={docsOpen}
			class:text-ink={docsOpen}
			onclick={() => (docsOpen = !docsOpen)}
		>
			Documents
		</button>
	</header>

	<div class="flex min-h-0 flex-1">
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<Conversation entries={thread.entries} onopenactivity={() => (activityOpen = true)} />
			<Composer />
			<ActivityDrawer
				groups={thread.activity}
				count={steps}
				open={activityOpen}
				onclose={() => (activityOpen = false)}
			/>
		</div>

		{#if docsOpen}
			<DocsSidebar docs={threadDocs} onclose={() => (docsOpen = false)} />
		{/if}
	</div>
</div>
