<script lang="ts">
	let draft = $state('');

	/* Frontend only: sending clears the box and nothing leaves the browser. */
	const send = () => {
		draft = '';
	};

	const onkeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	};
</script>

<div class="flex-none px-6 pt-2 pb-5">
	<div class="mx-auto max-w-[620px] rounded-[13px] border border-line bg-panel px-[14px] py-3 focus-within:border-edge">
		<textarea
			bind:value={draft}
			{onkeydown}
			rows="1"
			placeholder="Message the group…"
			class="min-h-[21px] w-full resize-none border-none bg-transparent text-[13.5px]/[1.5] text-ink outline-none placeholder:text-ink-3"
		></textarea>

		<div class="mt-[10px] flex items-center gap-[7px]">
			<button class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink">
				@ agent
			</button>
			<button class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink">
				◈ skill
			</button>
			<button
				class="ml-auto rounded-lg bg-ink px-[14px] py-[5.5px] text-[12.5px] font-semibold text-bg hover:bg-white"
				onclick={send}
			>
				Send
			</button>
		</div>
	</div>
</div>
