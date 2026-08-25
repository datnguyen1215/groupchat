<script lang="ts">
  import { page } from '$app/state';
  import type { Skill } from '$lib/data/skills';
  import { overlay } from '$lib/state/overlay.svelte';
  import Markdown from './Markdown.svelte';
  import Modal from './Modal.svelte';

  /**
   * Held, not looked up per render — same reason as `DocModal`: `page.data` is
   * re-fetched by every live event, and a skill missing from one of those
   * reloads would otherwise unmount the modal under the reader.
   */
  let shown = $state<Skill | null>(null);
  let missing = $state(false);

  let tab = $state<'about' | 'used-by'>('about');

  $effect(() => {
    if (!overlay.skillId) {
      shown = null;
      missing = false;
      return;
    }

    const found = (page.data.skills as Skill[]).find(s => s.id === overlay.skillId);
    if (found) {
      shown = found;
      missing = false;
    } else if (shown) {
      missing = true;
    }
  });

  /** Reset to About when a different skill opens, not on every live reload. */
  $effect(() => {
    overlay.skillId;
    tab = 'about';
  });
</script>

{#if shown}
  {@const it = shown}
  <Modal
    title={it.name}
    meta="Written by {it.author} · {it.updated} · {it.version} · used {it.uses}×"
    onclose={() => overlay.closeSkill()}
  >
    {#snippet body()}
      {#if missing}
        <p class="mb-5 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] text-ink-3">
          This skill was deleted. You are reading the last version you loaded.
        </p>
      {/if}
      <div class="mb-6 flex gap-1 rounded-lg bg-line-2 p-[2.5px] w-fit">
        {#each [['about', 'About'], ['used-by', 'Used by']] as [id, label] (id)}
          <button
            class="rounded-md px-3 py-[4.5px] text-[11.5px] font-medium"
            class:bg-panel-2={tab === id}
            class:text-ink={tab === id}
            class:text-ink-3={tab !== id}
            onclick={() => (tab = id as typeof tab)}
          >
            {label}
          </button>
        {/each}
      </div>

      {#if tab === 'about'}
        <Markdown source={it.body} />
      {:else}
        <p class="mb-4 max-w-[62ch] text-[13.5px]/[1.7] text-ink-2">
          Skills are global, but attachment is per agent. These agents currently have
          <code class="rounded bg-line-2 px-[5px] py-px font-mono text-[12.5px] text-accent"
            >{it.name}</code
          >
          attached.
        </p>
        <ul class="flex flex-col gap-2">
          {#each it.usedBy as agent (agent)}
            <li class="rounded-[9px] border border-line px-3 py-[9px] text-[13px]">{agent}</li>
          {/each}
        </ul>
      {/if}
    {/snippet}
    {#snippet footer()}
      <button
        class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink"
        >Edit</button
      >
      <button
        class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink"
        >Ask agent to revise</button
      >
      <button
        class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink"
        >Duplicate</button
      >
    {/snippet}
  </Modal>
{/if}
