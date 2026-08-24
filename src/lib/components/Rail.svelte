<script lang="ts">
	import { page } from '$app/state';
	import { threads } from '$lib/data/threads';
	import { you } from '$lib/data/agents';
	import Avatar from './Avatar.svelte';

	/* The divider encodes scope: Chats is thread-scoped, everything below is global. */
	const threadScoped = [
		{ href: `/chats/${threads[0].id}`, match: '/chats', glyph: '◆', label: 'Chats' }
	];

	const global = [
		{ href: '/agents', match: '/agents', glyph: '◇', label: 'Agents' },
		{ href: '/skills', match: '/skills', glyph: '◈', label: 'Skills' },
		{ href: '/documents', match: '/documents', glyph: '▤', label: 'Docs' }
	];

	const isActive = (match: string) => page.url.pathname.startsWith(match);
</script>

{#snippet railLink(item: { href: string; match: string; glyph: string; label: string })}
	<a
		href={item.href}
		title={item.label}
		class="flex w-[52px] flex-col items-center gap-[3px] rounded-[9px] pt-[7px] pb-[6px] hover:bg-panel-2"
		class:bg-panel-2={isActive(item.match)}
		class:text-ink={isActive(item.match)}
		class:text-ink-3={!isActive(item.match)}
	>
		<span class="text-[15px] leading-none">{item.glyph}</span>
		<span class="text-[9.5px] font-medium tracking-[0.01em]">{item.label}</span>
	</a>
{/snippet}

<nav class="flex w-[66px] flex-none flex-col items-center gap-[2px] border-r border-line py-3">
	<div class="mb-3 h-6 w-6 flex-none rounded-[7px] bg-gradient-to-br from-[#7aa2ff] to-[#b47aff]"></div>

	{#each threadScoped as item (item.href)}
		{@render railLink(item)}
	{/each}

	<div class="my-[7px] h-px w-[26px] bg-line"></div>

	{#each global as item (item.href)}
		{@render railLink(item)}
	{/each}

	<div class="flex-1"></div>
	<Avatar initials={you.initials} color={you.color} size="md" shape="circle" />
</nav>
