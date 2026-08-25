<script lang="ts">
  import type { Doc } from '$lib/data/documents';
  import { page } from '$app/state';
  import { overlay } from '$lib/state/overlay.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import Inline from './Inline.svelte';
  import PresenceRow from './PresenceRow.svelte';

  type Entry = {
    kind: 'message' | 'activity' | 'error';
    id: string;
    author: string;
    initials: string;
    color: string;
    tag?: string;
    isOrchestrator: boolean;
    isYou: boolean;
    time: string;
    paragraphs: string[];
    docId?: string;
    label: string;
    bars: ('ok' | 'run' | 'spawn')[];
  };
  type Busy = {
    id: string;
    name: string;
    initials: string;
    color: string;
    tag: string;
    statusLabel: string;
    lastStep: { name: string; detail: string } | null;
  };

  type Props = { entries: Entry[]; busy: Busy[]; onopenactivity: () => void };
  const { entries, busy, onopenactivity }: Props = $props();

  const barColor = { ok: 'bg-ok', run: 'bg-run', spawn: 'bg-accent' };
</script>

<div class="flex-1 overflow-y-auto pt-[30px] pb-[10px]">
  <div class="mx-auto max-w-[620px] px-6">
    {#each entries as entry (entry.id)}
      {#if entry.kind === 'activity'}
        <div class="mb-5 pl-[30px]">
          <button
            class="inline-flex items-center gap-2 rounded-full border border-line bg-panel py-[5px] pr-3 pl-[10px] text-[12px] text-ink-3 hover:border-edge hover:text-ink-2"
            onclick={onopenactivity}
          >
            <span class="flex items-center gap-[2px]">
              {#each entry.bars as bar, i (i)}
                <i class="block h-[9px] w-[3px] rounded-sm {barColor[bar]}"></i>
              {/each}
            </span>
            {entry.label}
          </button>
        </div>
      {:else if entry.kind === 'error'}
        <!-- A failure, not an agent talking: no avatar, no name, no tag. -->
        <!-- `status`, so a reader who cannot see the rule still hears the break. -->
        <div role="status" aria-label="Error" class="mb-5 flex items-center gap-[10px] pl-[30px]">
          <span class="h-px flex-1 bg-line"></span>
          <span class="flex items-center gap-[6px] text-[11px] whitespace-nowrap text-clay/80">
            <Icon name="warn" />
            {entry.label}
            <span class="text-ink-3">· {entry.time}</span>
          </span>
          <span class="h-px flex-1 bg-line"></span>
        </div>
      {:else}
        <article class="mb-5">
          <header class="mb-[5px] flex items-center gap-2">
            <Avatar initials={entry.initials} color={entry.color} />
            <b class="text-[12.5px] font-semibold tracking-[-0.005em]">{entry.author}</b>
            {#if entry.tag}
              <span
                class="rounded-[5px] px-[6px] py-px text-[9.5px] font-semibold tracking-[0.04em] uppercase {entry.isOrchestrator
                  ? 'bg-accent/[0.13] text-accent'
                  : 'bg-line-2 text-ink-3'}"
              >
                {entry.tag}
              </span>
            {/if}
            <span class="ml-auto text-[11px] text-ink-3">{entry.time}</span>
          </header>

          <div class="max-w-[56ch] pl-[30px] text-[13.5px] text-ink">
            {#each entry.paragraphs as paragraph, i (i)}
              <p class:mt-[7px]={i > 0}><Inline text={paragraph} /></p>
            {/each}

            {#if entry.docId}
              {@const doc = (page.data.documents as Doc[]).find(d => d.id === entry.docId)}
              {#if doc}
                <button
                  class="mt-2 inline-flex cursor-pointer items-center gap-[7px] rounded-lg border border-line bg-panel py-[6px] pr-[11px] pl-[9px] text-[12.5px] hover:border-edge hover:bg-panel-2"
                  onclick={() => overlay.openDoc(doc.id)}
                >
                  <Icon name="doc" />
                  {doc.name}
                  <span class="text-[11px] text-ink-3">{doc.size}</span>
                </button>
              {/if}
            {/if}
          </div>
        </article>
      {/if}
    {/each}

    <!-- Presence rows sit after the stream, never inside it. -->
    {#each busy as agent (agent.id)}
      <PresenceRow
        name={agent.name}
        initials={agent.initials}
        color={agent.color}
        tag={agent.tag}
        statusLabel={agent.statusLabel}
        lastStep={agent.lastStep}
      />
    {/each}

    {#if !entries.length && !busy.length}
      <p class="text-[13px] text-ink-3">Nothing here yet. Say something to get started.</p>
    {/if}
  </div>
</div>
