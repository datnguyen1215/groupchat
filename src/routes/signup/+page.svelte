<script lang="ts">
  import AuthCard from '$lib/components/AuthCard.svelte';
  import type { ActionData } from './$types';

  const { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Create account · groupchat</title></svelte:head>

<AuthCard title="Create account" lead="Email and a password. That's it." error={form?.message}>
  <form method="POST">
    <label class="auth-label" for="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      autocomplete="email"
      required
      value={form?.email ?? ''}
      class="auth-input"
      class:auth-input-error={form?.field === 'email'}
    />

    <label class="auth-label" for="password">Password</label>
    <input
      id="password"
      name="password"
      type="password"
      autocomplete="new-password"
      required
      class="auth-input"
      class:auth-input-error={form?.field === 'password'}
    />
    <p class="-mt-[6px] mb-3 text-[11.5px] text-ink-3">At least 8 characters.</p>

    <label class="auth-label" for="confirm">Confirm password</label>
    <input
      id="confirm"
      name="confirm"
      type="password"
      autocomplete="new-password"
      required
      class="auth-input"
      class:auth-input-error={form?.field === 'confirm'}
    />

    <button type="submit" class="auth-submit">Create account</button>
  </form>

  <p class="mt-3 text-center text-[11.5px] text-ink-3">
    Already have one? <a href="/login" class="text-accent hover:underline">Sign in</a>
  </p>
</AuthCard>
