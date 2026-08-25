<script lang="ts">
  import { page } from '$app/state';

  /* Inside `(app)`, so the rail renders around this and there is always a way back. */
  const message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<svelte:head><title>{page.status} · Group Chat</title></svelte:head>

<div class="grid min-h-0 flex-1 place-items-center p-6">
  <div class="max-w-[340px] text-center">
    <div
      class="mx-auto mb-[14px] grid h-11 w-11 place-items-center rounded-[12px] border border-clay/35 bg-panel-2 text-[18px] text-clay"
    >
      !
    </div>
    <h1 class="mb-[6px] text-[15px] font-semibold tracking-[-0.01em]">{message}</h1>
    <p class="mb-[18px] text-[12.5px] text-ink-2">
      {page.status === 404 ? 'It may have been deleted.' : 'Try again from your threads.'}
    </p>
    <a
      href="/"
      class="inline-block rounded-[9px] border border-line px-4 py-2 text-[12.5px] text-ink-2 hover:bg-panel-2 hover:text-ink"
    >
      Back to threads
    </a>
  </div>
</div>
