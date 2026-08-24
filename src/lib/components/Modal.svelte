<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		meta: string;
		onclose: () => void;
		body: Snippet;
		footer?: Snippet;
	};

	const { title, meta, onclose, body, footer }: Props = $props();

	const onkeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') onclose();
	};
</script>

<svelte:window {onkeydown} />

<!-- Scrim closes on backdrop click; Escape closes from anywhere via svelte:window. -->
<div class="fixed inset-0 z-60 grid place-items-center bg-black/60 px-5 py-[5vh] backdrop-blur-[4px]">
	<button class="absolute inset-0 cursor-default" onclick={onclose} aria-label="Close" tabindex="-1"></button>
	<div
		class="on-panel relative flex max-h-[90vh] w-full max-w-[780px] flex-col overflow-hidden rounded-[15px] border border-line bg-panel shadow-[0_24px_70px_rgba(0,0,0,.6)]"
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<header class="flex flex-none items-center gap-3 border-b border-line px-6 py-[17px]">
			<div>
				<h2 class="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
				<p class="mt-[3px] text-[11.5px] text-ink-3">{meta}</p>
			</div>
			<button
				class="ml-auto grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-[19px] text-ink-3 hover:bg-panel-2 hover:text-ink"
				onclick={onclose}
				aria-label="Close"
			>
				×
			</button>
		</header>

		<div class="overflow-y-auto px-[34px] pt-7 pb-11">
			{@render body()}
		</div>

		{#if footer}
			<footer class="flex flex-none gap-[7px] border-t border-line px-6 py-[11px]">
				{@render footer()}
			</footer>
		{/if}
	</div>
</div>
