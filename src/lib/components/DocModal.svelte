<script lang="ts">
  import { page } from '$app/state';
  import type { Doc } from '$lib/data/documents';
  import { overlay } from '$lib/state/overlay.svelte';
  import Markdown from './Markdown.svelte';
  import Modal from './Modal.svelte';

  const doc = $derived((page.data.documents as Doc[]).find(d => d.id === overlay.docId));
</script>

{#if doc}
  <Modal
    title={doc.name}
    meta="{doc.author} · {doc.updated} · {doc.version} · {doc.size}"
    onclose={() => overlay.closeDoc()}
  >
    {#snippet body()}
      <Markdown source={doc.body} />
    {/snippet}
    {#snippet footer()}
      <button
        class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink"
        >Edit</button
      >
      <button
        class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink"
        >History</button
      >
      <button
        class="rounded-[7px] border border-line px-[9px] py-[3.5px] text-[11.5px] text-ink-3 hover:border-edge hover:text-ink"
        >Copy</button
      >
    {/snippet}
  </Modal>
{/if}
