<script lang="ts">
	type Props = { name: 'doc' | 'search'; size?: number; class?: string };
	const { name, size = 13, class: cls = '' }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width={name === 'search' ? 1.7 : 1.3}
	class={cls}
	aria-hidden="true"
>
	{#if name === 'doc'}
		<path d="M4 1h5l3 3v11H4z" />
	{:else}
		<circle cx="7" cy="7" r="4.5" />
		<path d="M10.5 10.5L14 14" />
	{/if}
</svg>
