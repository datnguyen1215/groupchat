<script lang="ts">
  import { page } from '$app/state';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import type { ActionData } from './$types';

  const { form }: { form: ActionData } = $props();
  const next = $derived(page.url.searchParams.get('next') ?? '');
</script>

<svelte:head><title>Sign in · groupchat</title></svelte:head>

<AuthCard title="Sign in" lead="Welcome back." error={form?.message}>
  <form method="POST">
    <input type="hidden" name="next" value={next} />

    <label class="auth-label" for="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      autocomplete="email"
      required
      value={form?.email ?? ''}
      class="auth-input"
    />

    <label class="auth-label" for="password">Password</label>
    <input
      id="password"
      name="password"
      type="password"
      autocomplete="current-password"
      required
      class="auth-input"
      class:auth-input-error={!!form?.message}
    />

    <button type="submit" class="auth-submit">Sign in</button>
  </form>

  <p class="mt-3 text-center text-[11.5px] text-ink-3">
    No account? <a href="/signup" class="text-accent hover:underline">Create one</a>
  </p>
</AuthCard>
