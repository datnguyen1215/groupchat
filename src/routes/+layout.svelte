<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import DocModal from '$lib/components/DocModal.svelte';
  import Rail from '$lib/components/Rail.svelte';
  import SkillModal from '$lib/components/SkillModal.svelte';

  const { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex h-screen">
  <Rail />
  {@render children()}
</div>

<DocModal />
<SkillModal />
