<script lang="ts">
	import { page } from '$app/state';
	import { threads } from '$lib/data/threads';

	const groups = [
		{ label: 'Active', items: threads.filter((t) => t.group === 'Active') },
		{ label: 'Recent', items: threads.filter((t) => t.group === 'Recent') }
	];
</script>

<aside class="flex w-[230px] min-h-0 flex-none flex-col border-r border-line">
	<div class="flex items-center px-[15px] pt-[15px] pb-[10px]">
		<b class="text-[13px] font-semibold tracking-[-0.01em]">Threads</b>
		<button
			class="ml-auto h-[22px] w-[22px] rounded-md text-[15px] leading-none text-ink-3 hover:bg-panel-2 hover:text-ink"
			aria-label="New thread"
		>
			+
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
		{#each groups as group (group.label)}
			<h2 class="px-[10px] pt-3 pb-[5px] text-[10px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
				{group.label}
			</h2>
			{#each group.items as thread (thread.id)}
				<a
					href="/chats/{thread.id}"
					class="mb-px block rounded-[9px] px-[10px] py-[9px] hover:bg-line-2"
					class:bg-panel-2={page.params.id === thread.id}
				>
					<div class="flex items-center gap-[7px]">
						<i
							class="h-[5px] w-[5px] flex-none rounded-full"
							class:bg-line={!thread.live}
							class:bg-run={thread.live}
							class:shadow-[0_0_0_3px_rgba(224,176,85,.15)]={thread.live}
						></i>
						<span class="truncate text-[13px] font-medium tracking-[-0.005em]">{thread.name}</span>
						{#if thread.unread}
							<span class="ml-auto flex-none rounded-full bg-accent/[0.13] px-[6px] py-px text-[10px] font-semibold text-accent">
								{thread.unread}
							</span>
						{/if}
					</div>
					<div class="mt-[3px] truncate pl-3 text-[11.5px] text-ink-3">{thread.preview}</div>
				</a>
			{/each}
		{/each}
	</div>
</aside>
