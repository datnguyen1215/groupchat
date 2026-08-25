<script lang="ts">
  import { enhance } from '$app/forms';
  import { trace } from '$lib/logger.svelte';

  const log = trace('Composer');

  /* Sending is an intent to see your own message, wherever the stream was. */
  type Props = { onsend: () => void };
  const { onsend }: Props = $props();

  /* Eight lines at 13.5px/1.5, the realistic ceiling for a chat message. */
  const MAX_HEIGHT = 168;

  let draft = $state('');
  let form: HTMLFormElement;
  let input: HTMLTextAreaElement;
  let scrolled = $state(false);

  /* Enter sends; Shift+Enter breaks the line. */
  const onkeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim()) form.requestSubmit();
    }
  };

  /* Collapse to nothing first, or scrollHeight keeps the tallest height it ever had. */
  $effect(() => {
    void draft;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT)}px`;
    scrolled = input.scrollTop > 0;
  });
</script>

<form
  method="POST"
  bind:this={form}
  use:enhance={({ formData }) => {
    const chars = formData.get('message')?.toString().length ?? 0;
    log.info({ chars }, 'message submitted');

    /* Clear optimistically; the redirect re-renders the thread with it stored. */
    draft = '';
    onsend();
    return async ({ update, result }) => {
      log.info({ type: result.type }, 'submit settled');
      await update();
    };
  }}
  class="flex-none px-6 pt-2 pb-5"
>
  <div
    class="relative rounded-[13px] border border-line bg-panel px-[14px] py-3 focus-within:border-edge"
  >
    <!-- Once the text scrolls, this fades its top edge to say there is more above. -->
    <div
      class="pointer-events-none absolute inset-x-[14px] top-3 h-[18px] bg-gradient-to-b from-panel to-transparent transition-opacity"
      class:opacity-0={!scrolled}
    ></div>

    <textarea
      name="message"
      bind:this={input}
      bind:value={draft}
      {onkeydown}
      onscroll={() => (scrolled = input.scrollTop > 0)}
      rows="1"
      placeholder="Message the group…"
      class="on-panel block max-h-[168px] min-h-[21px] w-full resize-none overflow-y-auto border-none bg-transparent text-[13.5px]/[1.5] text-ink outline-none placeholder:text-ink-3"
    ></textarea>

    <div class="mt-[10px] flex items-center gap-[7px]">
      <button
        class="ml-auto rounded-lg bg-ink px-[14px] py-[5.5px] text-[12.5px] font-semibold text-bg hover:bg-white disabled:opacity-40"
        disabled={!draft.trim()}
      >
        Send
      </button>
    </div>
  </div>
</form>
