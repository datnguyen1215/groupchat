<script lang="ts">
  /**
   * Chat-sized markdown. Same parser as `Markdown.svelte`, tighter styling and
   * a narrower set of blocks: a message may use lists, quotes and code, but a
   * heading or a table in chat is a document that landed in the wrong place.
   * Those fall back to plain paragraphs so the text still reads.
   */
  import { parseMarkdown } from '$lib/markdown';
  import Inline from './Inline.svelte';

  type Props = { paragraphs: string[] };
  const { paragraphs }: Props = $props();

  const blocks = $derived(parseMarkdown(paragraphs.join('\n\n')));
</script>

{#each blocks as block, i (i)}
  {#if block.type === 'list'}
    <ul class="mt-[7px] list-disc pl-[18px]">
      {#each block.items as item, j (j)}
        <li class="mb-[3px]"><Inline text={item} /></li>
      {/each}
    </ul>
  {:else if block.type === 'quote'}
    <blockquote class:mt-[7px]={i > 0} class="border-l-2 border-line pl-[10px] text-ink-2">
      <Inline text={block.text} />
    </blockquote>
  {:else if block.type === 'code'}
    <pre class="mt-[7px] overflow-x-auto rounded-lg border border-line bg-[#0b0b0d] px-3 py-2"><code
        class="font-mono text-[12px]/[1.6] text-[#c9c9c6]">{block.text}</code
      ></pre>
  {:else if block.type === 'heading'}
    <p class:mt-[7px]={i > 0}><Inline text={block.text} /></p>
  {:else if block.type === 'paragraph'}
    <p class:mt-[7px]={i > 0}><Inline text={block.text} /></p>
  {/if}
{/each}
