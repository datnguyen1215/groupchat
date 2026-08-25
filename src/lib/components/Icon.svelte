<script lang="ts">
  type Props = {
    name: 'doc' | 'search' | 'pencil' | 'trash' | 'warn';
    size?: number;
    class?: string;
  };
  const { name, size = 13, class: cls = '' }: Props = $props();

  const width = { doc: 1.3, search: 1.7, pencil: 1.4, trash: 1.4, warn: 1.4 };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width={width[name]}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={cls}
  aria-hidden="true"
>
  {#if name === 'doc'}
    <path d="M4 1h5l3 3v11H4z" />
  {:else if name === 'search'}
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  {:else if name === 'pencil'}
    <path d="M9.5 3.5 12.5 6.5 6 13H3v-3z" />
  {:else if name === 'warn'}
    <path d="M8 2.2 14.5 13.4H1.5z" />
    <path d="M8 6.6v3.1M8 11.7v.1" />
  {:else}
    <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8l.7-8.2" />
  {/if}
</svg>
