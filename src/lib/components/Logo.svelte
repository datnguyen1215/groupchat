<script lang="ts">
  type Props = { size?: number; title?: string };

  const { size = 24, title }: Props = $props();

  /* Gradient and mask ids must be unique — the mark can appear more than once per page. */
  const uid = $props.id();
  const gradient = `logo-gradient-${uid}`;
  const bubble = `logo-bubble-${uid}`;

  const diamond = 'M24 3 45 24 24 45 3 24Z';
  const speech =
    'M17 17h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-7l-5 4v-4h-2a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z';
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 48 48"
  class="flex-none"
  role={title ? 'img' : 'presentation'}
  aria-label={title}
>
  <defs>
    <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7aa2ff" />
      <stop offset="1" stop-color="#b47aff" />
    </linearGradient>
    <mask id={bubble}>
      <path d={diamond} fill="#fff" />
      <path d={speech} fill="#000" />
    </mask>
  </defs>
  <path d={diamond} fill="url(#{gradient})" mask="url(#{bubble})" />
</svg>
