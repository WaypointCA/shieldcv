<script lang="ts">
  import { placeholderAi } from '@shieldcv/ai';
  import { placeholderAudit } from '@shieldcv/audit';
  import { placeholderCompliance } from '@shieldcv/compliance';
  import { placeholderCrypto } from '@shieldcv/crypto';
  import { placeholderStorage } from '@shieldcv/storage';

  const packageStatus = [
    placeholderCrypto(),
    placeholderStorage(),
    placeholderAi(),
    placeholderCompliance(),
    placeholderAudit(),
  ];
</script>

<svelte:head>
  <title>ShieldCV</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 text-slate-50">
  <main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-5 py-12">
    <p class="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">ShieldCV</p>
    <h1 class="text-4xl font-semibold leading-tight sm:text-5xl">
      Local-first resume security with privacy built in.
    </h1>
    <p class="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
      This scaffold boots the mobile-first PWA, static deployment pipeline, and workspace packages
      for crypto, storage, AI, compliance, and audit functionality.
    </p>

    <section class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/30">
      <h2 class="text-lg font-semibold text-white">Workspace packages</h2>
      <ul class="mt-4 space-y-2 text-sm text-slate-300">
        {#each packageStatus as status}
          <li class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">{status}</li>
        {/each}
      </ul>
    </section>
  </main>
</div>
