<script lang="ts">
  import {
    FileText,
    Radar,
    ScanSearch,
    Settings,
    ShieldCheck,
  } from 'lucide-svelte';
  import { page } from '$app/state';
  import { theme } from '$lib/stores/theme';

  type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  };

  type NavItem = {
    href: string;
    label: string;
    icon: typeof FileText;
  };

  const navItems: NavItem[] = [
    { href: '/', label: 'Resumes', icon: FileText },
    { href: '/scan', label: 'Scan', icon: ScanSearch },
    { href: '/audit', label: 'Audit', icon: Radar },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let showInstall = false;

  function isActive(href: string) {
    return page.url.pathname === href;
  }

  function currentTitle() {
    const item = navItems.find(({ href }) => page.url.pathname === href);
    return item?.label ?? 'ShieldCV';
  }

  function handleInstallPrompt(event: Event) {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    showInstall = true;
  }

  async function installApp() {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    showInstall = false;
  }
</script>

<svelte:window on:beforeinstallprompt={handleInstallPrompt} />

<div class="app-shell">
  <aside class="shell-nav" aria-label="Primary navigation">
    <div class="shell-brand">
      <div class="shell-brand__mark">
        <ShieldCheck size={20} />
      </div>
      <div>
        <p class="shell-kicker">ShieldCV</p>
        <h1 class="shell-title">Local-first vault</h1>
      </div>
    </div>

    <nav class="nav-list">
      {#each navItems as item}
        <a
          class:active={isActive(item.href)}
          class="nav-link"
          href={item.href}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          <item.icon size={18} />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>

    <div class="shell-actions">
      {#if showInstall}
        <button class="shell-button shell-button--primary" type="button" on:click={installApp}>
          Install ShieldCV
        </button>
      {/if}

      <button class="shell-button" type="button" on:click={() => theme.toggle()}>
        {#if $theme === 'dark'}
          Light theme
        {:else}
          Dark theme
        {/if}
      </button>
    </div>
  </aside>

  <div class="shell-main">
    <header class="shell-header">
      <div>
        <p class="shell-kicker">Workspace</p>
        <h2 class="shell-page-title">{currentTitle()}</h2>
      </div>

      {#if showInstall}
        <button class="shell-button shell-button--primary shell-button--mobile" type="button" on:click={installApp}>
          Install ShieldCV
        </button>
      {/if}
    </header>

    <main class="shell-content">
      <slot />
    </main>
  </div>
</div>

<nav class="tabbar" aria-label="Primary navigation">
  {#each navItems as item}
    <a
      class:active={isActive(item.href)}
      class="tabbar-link"
      href={item.href}
      aria-current={isActive(item.href) ? 'page' : undefined}
    >
      <item.icon size={18} />
      <span>{item.label}</span>
    </a>
  {/each}
</nav>
