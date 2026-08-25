<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { createThread } from '$lib/threads';
  import { trace } from '$lib/logger.svelte';

  trace('EmptyThreads');

  let creating = $state(false);

  const create = async () => {
    creating = true;
    const thread = await createThread();
    if (!thread) {
      creating = false;
      return;
    }
    await invalidateAll();
    await goto(`/chats/${thread.id}`);
  };
</script>

<svelte:head><title>Group Chat</title></svelte:head>

<div class="grid min-h-0 flex-1 place-items-center p-6">
  <div class="max-w-[340px] text-center">
    <div
      class="mx-auto mb-[14px] grid h-11 w-11 place-items-center rounded-[12px] border border-line bg-panel-2 text-[18px] text-ink-3"
    >
      ◆
    </div>
    <h1 class="mb-[6px] text-[15px] font-semibold tracking-[-0.01em]">No threads yet</h1>
    <p class="mb-[18px] text-[12.5px] text-ink-2">
      Threads are where you and your agents work. Create one to get started.
    </p>
    <button
      class="rounded-[9px] bg-accent px-4 py-2 text-[12.5px] font-semibold text-bg hover:brightness-110 disabled:opacity-60"
      disabled={creating}
      onclick={create}
    >
      {creating ? 'Creating…' : 'New thread'}
    </button>
  </div>
</div>
