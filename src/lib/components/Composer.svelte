<script lang="ts">
  import { enhance } from '$app/forms';

  let draft = $state('');
  let form: HTMLFormElement;

  /* Enter sends; Shift+Enter breaks the line. */
  const onkeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim()) form.requestSubmit();
    }
  };
</script>

<form
  method="POST"
  bind:this={form}
  use:enhance={() => {
    /* Clear optimistically; the redirect re-renders the thread with it stored. */
    draft = '';
    return async ({ update }) => update();
  }}
  class="flex-none px-6 pt-2 pb-5"
>
  <div
    class="mx-auto max-w-[620px] rounded-[13px] border border-line bg-panel px-[14px] py-3 focus-within:border-edge"
  >
    <textarea
      name="message"
      bind:value={draft}
      {onkeydown}
      rows="1"
      placeholder="Message the group…"
      class="min-h-[21px] w-full resize-none border-none bg-transparent text-[13.5px]/[1.5] text-ink outline-none placeholder:text-ink-3"
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
