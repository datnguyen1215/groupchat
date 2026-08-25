<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import { createThread } from '$lib/threads';
  import { trace } from '$lib/logger.svelte';

  const log = trace('ThreadList');

  type Thread = {
    id: string;
    name: string;
    group: string;
    live: boolean;
    unread: number;
    preview: string;
  };
  const { threads }: { threads: Thread[] } = $props();

  const groups = $derived([
    { label: 'Active', items: threads.filter(t => t.group === 'Active') },
    { label: 'Recent', items: threads.filter(t => t.group === 'Recent') }
  ]);

  /* Which thread the right-click menu belongs to, and where to draw it. */
  let menu = $state<{ id: string; x: number; y: number } | null>(null);
  let renamingId = $state<string | null>(null);
  let draft = $state('');
  /* The thread awaiting delete confirmation, held by value so the dialog can
     still name it after the row leaves the list. */
  let pending = $state<{ id: string; name: string } | null>(null);

  const create = async () => {
    const thread = await createThread();
    if (!thread) return;
    await invalidateAll();
    await goto(`/chats/${thread.id}`);
    startRename(thread.id, thread.name);
  };

  /* `autofocus` is ignored when the click that opened the input still holds focus. */
  const selectAll = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };

  const startRename = (id: string, name: string) => {
    log.info({ threadId: id, name }, 'rename started');
    menu = null;
    renamingId = id;
    draft = name;
  };

  const commit = async () => {
    const id = renamingId;
    const name = draft.trim();
    renamingId = null;
    if (!id || !name) {
      log.info({ threadId: id }, 'rename cancelled — empty');
      return;
    }

    const res = await fetch(`/api/threads/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (res.ok) log.info({ threadId: id, name }, 'renamed');
    else log.error({ threadId: id, name, status: res.status }, 'rename failed');

    await invalidateAll();
  };

  const onkeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') renamingId = null;
  };

  const askDelete = (id: string, name: string) => {
    log.info({ threadId: id, name }, 'delete confirmation opened');
    menu = null;
    pending = { id, name };
  };

  const confirmDelete = async () => {
    const target = pending;
    pending = null;
    if (!target) return;

    const res = await fetch(`/api/threads/${target.id}`, { method: 'DELETE' });
    if (!res.ok) {
      log.error({ threadId: target.id, status: res.status }, 'delete failed');
      return;
    }
    log.info({ threadId: target.id, name: target.name }, 'deleted');
    /* Leave the thread first — its route would 404 once the row is gone. The
       live event for the delete also invalidates, and racing it against the
       navigation would re-run the dead route's load, so the goto carries the
       invalidation rather than following it. */
    if (page.params.id === target.id) await goto('/', { invalidateAll: true });
    else await invalidateAll();
  };
</script>

<svelte:window
  onclick={() => (menu = null)}
  onkeydown={e => {
    if (e.key !== 'Escape') return;
    if (pending) pending = null;
    else menu = null;
  }}
/>

<aside class="flex w-[230px] min-h-0 flex-none flex-col border-r border-line">
  <div class="flex items-center px-[15px] pt-[15px] pb-[10px]">
    <b class="text-[13px] font-semibold tracking-[-0.01em]">Threads</b>
    <button
      class="ml-auto h-[22px] w-[22px] rounded-md text-[15px] leading-none text-ink-3 hover:bg-panel-2 hover:text-ink"
      aria-label="New thread"
      onclick={create}
    >
      +
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
    {#each groups as group (group.label)}
      <h2
        class="px-[10px] pt-3 pb-[5px] text-[10px] font-semibold tracking-[0.07em] text-ink-3 uppercase"
      >
        {group.label}
      </h2>
      {#each group.items as thread (thread.id)}
        <a
          href="/chats/{thread.id}"
          class="mb-px block rounded-[9px] px-[10px] py-[9px] hover:bg-line-2"
          class:bg-panel-2={page.params.id === thread.id}
          oncontextmenu={e => {
            e.preventDefault();
            log.debug({ threadId: thread.id }, 'context menu');
            menu = { id: thread.id, x: e.clientX, y: e.clientY };
          }}
        >
          <div class="flex items-center gap-[7px]">
            <i
              class="h-[5px] w-[5px] flex-none rounded-full"
              class:bg-line={!thread.live}
              class:bg-run={thread.live}
              class:shadow-[0_0_0_3px_rgba(224,176,85,.15)]={thread.live}
            ></i>
            {#if renamingId === thread.id}
              <input
                class="min-w-0 flex-1 rounded-[5px] border border-accent bg-panel-2 px-1 py-px text-[13px] font-medium tracking-[-0.005em] outline-none"
                bind:value={draft}
                {@attach selectAll}
                onclick={e => e.preventDefault()}
                onblur={commit}
                {onkeydown}
              />
            {:else}
              <span class="truncate text-[13px] font-medium tracking-[-0.005em]">{thread.name}</span
              >
              {#if thread.unread}
                <span
                  class="ml-auto flex-none rounded-full bg-accent/[0.13] px-[6px] py-px text-[10px] font-semibold text-accent"
                >
                  {thread.unread}
                </span>
              {/if}
            {/if}
          </div>
          <div class="mt-[3px] truncate pl-3 text-[11.5px] text-ink-3">{thread.preview}</div>
        </a>
      {/each}
    {/each}
  </div>
</aside>

{#if menu}
  {@const target = menu}
  {@const name = threads.find(t => t.id === target.id)?.name ?? ''}
  <div
    class="fixed z-50 min-w-[140px] rounded-[9px] border border-line bg-panel py-1 shadow-lg"
    style="left: {target.x}px; top: {target.y}px"
  >
    <button
      class="flex w-full items-center gap-[9px] px-3 py-[6px] text-left text-[12.5px] text-ink-2 hover:bg-panel-2 hover:text-ink"
      onclick={() => startRename(target.id, name)}
    >
      <Icon name="pencil" />
      Rename
    </button>
    <div class="my-1 h-px bg-line"></div>
    <button
      class="flex w-full items-center gap-[9px] px-3 py-[6px] text-left text-[12.5px] text-clay hover:bg-clay/[0.12]"
      onclick={() => askDelete(target.id, name)}
    >
      <Icon name="trash" />
      Delete
    </button>
  </div>
{/if}

{#if pending}
  {@const target = pending}
  <div class="fixed inset-0 z-60 grid place-items-center bg-black/55 px-5 backdrop-blur-[2px]">
    <button
      class="absolute inset-0 cursor-default"
      onclick={() => (pending = null)}
      aria-label="Dismiss"
      tabindex="-1"
    ></button>
    <div
      class="relative w-full max-w-[340px] rounded-[14px] border border-line bg-panel p-5 shadow-[0_24px_60px_rgba(0,0,0,.6)]"
      role="dialog"
      aria-modal="true"
      aria-label="Delete thread"
    >
      <h2 class="text-[14.5px] font-semibold tracking-[-0.01em]">Delete this thread?</h2>
      <p class="mt-[6px] text-[12.5px] text-ink-2">
        <b class="font-semibold text-ink">{target.name}</b> and all of its messages, activity and documents
        will be permanently removed. This cannot be undone.
      </p>
      <div class="mt-[18px] flex justify-end gap-2">
        <button
          class="rounded-lg border border-line px-[14px] py-[7px] text-[12.5px] text-ink-2 hover:bg-panel-2 hover:text-ink"
          onclick={() => (pending = null)}
        >
          Cancel
        </button>
        <button
          class="rounded-lg border border-clay bg-clay px-[14px] py-[7px] text-[12.5px] font-semibold text-[#17110f] hover:brightness-110"
          onclick={confirmDelete}
          {@attach (node: HTMLButtonElement) => node.focus()}
        >
          Delete thread
        </button>
      </div>
    </div>
  </div>
{/if}
