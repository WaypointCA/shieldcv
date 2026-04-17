<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import { createResume, isVaultUnlocked, unlockVault, vaultStatus } from '$lib/resume-vault';

  let unlocked = false;
  let creating = true;
  let unlockBusy = false;
  let error = '';

  async function createAndRedirect() {
    creating = true;
    const resume = await createResume();
    await goto(`/resumes/${resume.id}`, { replaceState: true });
  }

  async function handleUnlock(passphrase: string) {
    unlockBusy = true;

    try {
      await unlockVault(passphrase);
      unlocked = true;
      error = '';
      await createAndRedirect();
    } catch (unlockError) {
      error = unlockError instanceof Error ? unlockError.message : 'Unable to unlock the resume vault.';
      creating = false;
    } finally {
      unlockBusy = false;
    }
  }

  onMount(async () => {
    unlocked = await isVaultUnlocked();

    if (unlocked) {
      await createAndRedirect();
    } else {
      creating = false;
    }
  });

  $: unlocked = $vaultStatus === 'unlocked';
</script>

<svelte:head>
  <title>New Resume | ShieldCV</title>
</svelte:head>

{#if creating}
  <section class="content-card">
    <p class="section-kicker">Resume Vault</p>
    <h3>Preparing your resume</h3>
    <p>Creating a fresh encrypted record on this device…</p>
  </section>
{:else}
  <VaultUnlockPanel
    busy={unlockBusy}
    copy="Unlock the vault first, then ShieldCV will create a blank resume and take you straight into the editor."
    error={error}
    onUnlock={handleUnlock}
    title="Unlock to create a resume"
  />
{/if}
