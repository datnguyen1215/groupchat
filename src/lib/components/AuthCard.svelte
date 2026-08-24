<script lang="ts">
  import type { Snippet } from 'svelte';
  import Logo from './Logo.svelte';

  type Props = { title: string; lead: string; error?: string; children: Snippet };
  const { title, lead, error, children }: Props = $props();
</script>

<div class="grid h-screen place-items-center bg-bg px-5">
  <div class="w-[300px] rounded-[14px] border border-line bg-panel p-[22px]">
    <div class="mb-4 flex items-center gap-2">
      <Logo size={20} />
      <b class="text-[13px] font-semibold tracking-[-0.01em]">groupchat</b>
    </div>

    <h1 class="mb-[5px] text-[15px] font-[650] tracking-[-0.015em]">{title}</h1>
    <p class="mb-4 text-[12px]/[1.5] text-ink-2">{lead}</p>

    {#if error}
      <p
        class="mb-[14px] flex items-start gap-2 rounded-[9px] border border-clay/35 bg-clay/10 px-[10px] py-2 text-[11.5px] text-clay"
        role="alert"
      >
        <span aria-hidden="true">⚠</span><span>{error}</span>
      </p>
    {/if}

    {@render children()}
  </div>
</div>
