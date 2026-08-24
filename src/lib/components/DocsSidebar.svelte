<script lang="ts">
  import type { Doc } from '$lib/data/documents';
  import { overlay } from '$lib/state/overlay.svelte';
  import Icon from './Icon.svelte';

  type Props = { docs: Doc[]; onclose: () => void };
  const { docs, onclose }: Props = $props();

  let query = $state('');

  const shown = $derived(
    docs.filter(doc => doc.name.toLowerCase().includes(query.trim().toLowerCase()))
  );
</script>

<aside class="flex w-[280px] min-h-0 flex-none flex-col border-l border-line">
  <header class="flex h-[52px] flex-none items-center gap-2 border-b border-line px-[15px]">
    <b class="text-[12.5px] font-semibold">Documents</b>
    <span class="rounded-full bg-line-2 px-[7px] py-[1.5px] text-[10.5px] text-ink-3"
      >this thread</span
    >
    <button
      class="ml-auto h-6 w-6 rounded-md text-[17px] leading-none text-ink-3 hover:bg-panel-2 hover:text-ink"
      onclick={onclose}
      aria-label="Close documents"
    >
      ×
    </button>
  </header>

  <div class="relative mx-3 mt-[10px] mb-1">
    <Icon name="search" size={12} class="absolute top-[8px] left-[9px] text-ink-3" />
    <input
      bind:value={query}
      placeholder="Search"
      class="w-full rounded-lg border border-line bg-panel py-[6.5px] pr-[10px] pl-7 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-edge"
    />
  </div>

  <div class="flex-1 overflow-y-auto px-2 pt-[6px] pb-4">
    {#each shown as doc (doc.id)}
      <button
        class="block w-full rounded-[9px] px-[10px] py-[9px] text-left hover:bg-panel-2"
        onclick={() => overlay.openDoc(doc.id)}
      >
        <span class="flex items-center gap-[7px] text-[12.5px] font-medium tracking-[-0.005em]">
          <Icon name="doc" class="flex-none opacity-40" />
          {doc.name}
        </span>
        <span class="mt-[3px] block pl-5 text-[11px] text-ink-3">
          {doc.author} · {doc.updated} · {doc.version}
        </span>
      </button>
    {/each}

    {#if shown.length === 0}
      <p class="px-[10px] py-2 text-[12px] text-ink-3">No documents match.</p>
    {/if}
  </div>

  <a
    href="/documents"
    class="mx-3 mt-[2px] mb-[14px] flex-none rounded-lg border border-line py-[7px] text-center text-[12px] text-ink-3 hover:border-edge hover:bg-panel-2 hover:text-ink-2"
  >
    View all documents →
  </a>
</aside>
