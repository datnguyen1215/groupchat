<script lang="ts">
  import ActivityDrawer from '$lib/components/ActivityDrawer.svelte';
  import Composer from '$lib/components/Composer.svelte';
  import Conversation from '$lib/components/Conversation.svelte';
  import DocsSidebar from '$lib/components/DocsSidebar.svelte';
  import ThreadList from '$lib/components/ThreadList.svelte';
  import { invalidateAll } from '$app/navigation';
  import { trace } from '$lib/logger.svelte';

  const { data } = $props();

  const log = trace('ChatPage');

  const thread = $derived(data.thread);
  const events = $derived(data.activity.reduce((n, g) => n + g.steps.length, 0));

  let activityOpen = $state(false);
  let docsOpen = $state(false);

  /* Held so the composer can scroll the stream back down on send. */
  let conversation: Conversation;

  /* Click the title to rename; the sidebar's context menu does the same thing. */
  let renaming = $state(false);
  let draft = $state('');

  /* `autofocus` is ignored when the click that opened the input still holds focus. */
  const selectAll = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };

  const startRename = () => {
    log.info({ threadId: thread.id, name: thread.name }, 'rename started');
    draft = thread.name;
    renaming = true;
  };

  const commit = async () => {
    const name = draft.trim();
    renaming = false;
    if (!name || name === thread.name) {
      log.info({ threadId: thread.id }, 'rename cancelled — unchanged');
      return;
    }

    const response = await fetch(`/api/threads/${thread.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (response.ok) log.info({ threadId: thread.id, name }, 'renamed');
    else log.error({ threadId: thread.id, name, status: response.status }, 'rename failed');

    await invalidateAll();
  };

  /* Panels are per-thread affordances; collapse them when the thread changes. */
  $effect(() => {
    log.info({ threadId: thread.id, name: thread.name }, 'thread opened');
    activityOpen = false;
    docsOpen = false;
    renaming = false;
  });
</script>

<svelte:head><title>{thread.name} · Group Chat</title></svelte:head>

<ThreadList threads={data.threads} />

<div class="flex min-h-0 min-w-0 flex-1 flex-col">
  <header class="flex h-[52px] flex-none items-center gap-[14px] border-b border-line px-5">
    {#if renaming}
      <input
        class="w-[260px] rounded-[6px] border border-accent bg-panel-2 px-2 py-[3px] text-[14.5px] font-semibold tracking-[-0.01em] outline-none"
        bind:value={draft}
        {@attach selectAll}
        onblur={commit}
        onkeydown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') renaming = false;
        }}
      />
    {:else}
      <button
        class="rounded-[6px] px-1 py-[3px] text-[14.5px] font-semibold tracking-[-0.01em] hover:bg-panel-2"
        title="Rename thread"
        onclick={startRename}
      >
        {thread.name}
      </button>
    {/if}
    <div class="flex-1"></div>

    <button
      class="rounded-[7px] border border-line px-[11px] py-[5px] text-[12.5px] text-ink-2 hover:border-ink-3 hover:text-ink"
      class:bg-panel-2={activityOpen}
      class:text-ink={activityOpen}
      onclick={() => {
        activityOpen = !activityOpen;
        log.info({ threadId: thread.id, open: activityOpen }, 'activity toggled');
      }}
    >
      Activity · {events}
    </button>
    <button
      class="rounded-[7px] border border-line px-[11px] py-[5px] text-[12.5px] text-ink-2 hover:border-ink-3 hover:text-ink"
      class:bg-panel-2={docsOpen}
      class:text-ink={docsOpen}
      onclick={() => {
        docsOpen = !docsOpen;
        log.info({ threadId: thread.id, open: docsOpen }, 'documents toggled');
      }}
    >
      Documents
    </button>
  </header>

  <div class="flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Conversation bind:this={conversation} entries={data.entries} busy={data.busy} />
      <Composer onsend={() => conversation.pinToBottom()} />
      <ActivityDrawer
        groups={data.activity}
        count={events}
        open={activityOpen}
        onclose={() => (activityOpen = false)}
      />
    </div>

    {#if docsOpen}
      <DocsSidebar docs={data.threadDocs} onclose={() => (docsOpen = false)} />
    {/if}
  </div>
</div>
