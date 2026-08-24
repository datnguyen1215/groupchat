<script lang="ts">
  import DocModal from '$lib/components/DocModal.svelte';
  import Rail from '$lib/components/Rail.svelte';
  import SkillModal from '$lib/components/SkillModal.svelte';
  import { live } from '$lib/state/live.svelte';

  const { children } = $props();

  /* One stream for the whole app. Every page's data invalidates off it. */
  $effect(() => live.connect());
</script>

<div class="flex h-screen">
  <Rail />
  {@render children()}
</div>

<DocModal />
<SkillModal />
