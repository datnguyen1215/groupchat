<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { threads } from '$lib/data/threads';
  import { you } from '$lib/data/agents';
  import { signOut } from '$lib/auth-client';
  import Avatar from './Avatar.svelte';
  import Logo from './Logo.svelte';

  /* The divider encodes scope: Chats is thread-scoped, everything below is global. */
  const threadScoped = [
    { href: `/chats/${threads[0].id}`, match: '/chats', glyph: '◆', label: 'Chats' }
  ];

  const global = [
    { href: '/agents', match: '/agents', glyph: '◇', label: 'Agents' },
    { href: '/skills', match: '/skills', glyph: '◈', label: 'Skills' },
    { href: '/documents', match: '/documents', glyph: '▤', label: 'Docs' }
  ];

  const isActive = (match: string) => page.url.pathname.startsWith(match);

  /* No name field at signup, so the address is the only label we have. */
  const email = $derived(page.data.user?.email ?? '');
  const initials = $derived(email.slice(0, 2).toUpperCase() || you.initials);

  let menuOpen = $state(false);

  const handleSignOut = async () => {
    menuOpen = false;
    await signOut();
    await goto('/login', { invalidateAll: true });
  };
</script>

{#snippet railLink(item: { href: string; match: string; glyph: string; label: string })}
  <a
    href={item.href}
    title={item.label}
    class="flex w-[52px] flex-col items-center gap-[3px] rounded-[9px] pt-[7px] pb-[6px] hover:bg-panel-2"
    class:bg-panel-2={isActive(item.match)}
    class:text-ink={isActive(item.match)}
    class:text-ink-3={!isActive(item.match)}
  >
    <span class="text-[15px] leading-none">{item.glyph}</span>
    <span class="text-[9.5px] font-medium tracking-[0.01em]">{item.label}</span>
  </a>
{/snippet}

<nav class="flex w-[66px] flex-none flex-col items-center gap-[2px] border-r border-line py-3">
  <a href="/" title="groupchat" class="mb-3 flex-none">
    <Logo size={24} title="groupchat" />
  </a>

  {#each threadScoped as item (item.href)}
    {@render railLink(item)}
  {/each}

  <div class="my-[7px] h-px w-[26px] bg-line"></div>

  {#each global as item (item.href)}
    {@render railLink(item)}
  {/each}

  <div class="flex-1"></div>

  <div class="relative">
    <button
      type="button"
      title={email}
      aria-label="Account"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <Avatar {initials} color={you.color} size="md" shape="circle" />
    </button>

    {#if menuOpen}
      <!-- Click-away sits behind the menu so the menu itself stays clickable. -->
      <button
        type="button"
        class="fixed inset-0 z-10 cursor-default"
        aria-label="Close account menu"
        onclick={() => (menuOpen = false)}
      ></button>

      <div
        class="absolute bottom-0 left-[calc(100%+8px)] z-20 min-w-[180px] rounded-[9px] border border-line bg-panel py-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
      >
        <p class="truncate px-3 py-[6px] text-[11.5px] text-ink-3">{email}</p>
        <div class="my-1 h-px bg-line"></div>
        <button
          type="button"
          class="w-full px-3 py-[6px] text-left text-[12.5px] text-clay hover:bg-clay/12"
          onclick={handleSignOut}
        >
          Sign out
        </button>
      </div>
    {/if}
  </div>
</nav>
