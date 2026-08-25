<script lang="ts">
  import { page } from '$app/state';
  import type { Doc } from '$lib/data/documents';
  import { overlay } from '$lib/state/overlay.svelte';
  import Markdown from './Markdown.svelte';
  import Modal from './Modal.svelte';

  /**
   * The open document, held rather than looked up fresh on every render.
   *
   * `page.data.documents` is re-fetched by every live event, and an agent
   * writing a document fires several per turn. Rendering straight off a `find`
   * meant any gap in that array — a rename, a delete, an in-flight reload —
   * unmounted the modal under the reader, which looks exactly like the document
   * closing itself. `overlay.docId` is the only thing that decides what is open;
   * the array only supplies the body.
   */
  let shown = $state<Doc | null>(null);
  let missing = $state(false);

  $effect(() => {
    if (!overlay.docId) {
      shown = null;
      missing = false;
      return;
    }

    const found = (page.data.documents as Doc[]).find(d => d.id === overlay.docId);
    /** Keep the last good copy: absence is usually a reload, not a deletion. */
    if (found) {
      shown = found;
      missing = false;
    } else if (shown) {
      /** Gone while open. Say so instead of vanishing; the reader closes it. */
      missing = true;
    }
  });
</script>

{#if shown}
  {@const doc = shown}
  <Modal
    title={doc.name}
    meta="{doc.author} · {doc.updated} · {doc.version} · {doc.size}"
    onclose={() => overlay.closeDoc()}
  >
    {#snippet body()}
      {#if missing}
        <p class="mb-5 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] text-ink-3">
          This document was deleted. You are reading the last version you loaded.
        </p>
      {/if}
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
