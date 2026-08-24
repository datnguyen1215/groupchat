<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';

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

  const create = async () => {
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled' })
    });
    if (!res.ok) return;
    const { thread } = await res.json();
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
    menu = null;
    renamingId = id;
    draft = name;
  };

  const commit = async () => {
    const id = renamingId;
    const name = draft.trim();
    renamingId = null;
    if (!id || !name) return;
    await fetch(`/api/threads/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await invalidateAll();
  };

  const onkeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') renamingId = null;
  };
</script>

<svelte:window onclick={() => (menu = null)} onkeydown={e => e.key === 'Escape' && (menu = null)} />

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
  <div
    class="fixed z-50 min-w-[140px] rounded-[9px] border border-line bg-panel py-1 shadow-lg"
    style="left: {target.x}px; top: {target.y}px"
  >
    <button
      class="block w-full px-3 py-[6px] text-left text-[12.5px] text-ink-2 hover:bg-panel-2 hover:text-ink"
      onclick={() => startRename(target.id, threads.find(t => t.id === target.id)?.name ?? '')}
    >
      Rename
    </button>
  </div>
{/if}
