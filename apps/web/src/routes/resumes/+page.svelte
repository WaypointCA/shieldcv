<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import {
    deleteResume,
    isVaultUnlocked,
    listResumes,
    lockVault,
    unlockVault,
  } from '$lib/resume-vault';
  import type { ResumeDocument } from '@shieldcv/resume';

  type ConfirmDialogHandle = { showModal: () => Promise<void> };

  let resumes: ResumeDocument[] = [];
  let loading = true;
  let unlockBusy = false;
  let unlocked = false;
  let error = '';
  let deletingId: string | null = null;
  let deleteDialog: ConfirmDialogHandle | null = null;

  async function refreshResumes() {
    loading = true;

    try {
      resumes = await listResumes();
      unlocked = true;
      error = '';
    } finally {
      loading = false;
    }
  }

  async function handleUnlock(passphrase: string) {
    unlockBusy = true;

    try {
      await unlockVault(passphrase);
      await refreshResumes();
    } catch (unlockError) {
      error = unlockError instanceof Error ? unlockError.message : 'Unable to unlock the resume vault.';
    } finally {
      unlockBusy = false;
    }
  }

  function requestDelete(id: string) {
    deletingId = id;
    void deleteDialog?.showModal();
  }

  async function confirmDelete() {
    if (!deletingId) {
      return;
    }

    await deleteResume(deletingId);
    deletingId = null;
    await refreshResumes();
  }

  async function handleLock() {
    await lockVault();
    unlocked = false;
    resumes = [];
  }

  onMount(async () => {
    unlocked = await isVaultUnlocked();

    if (unlocked) {
      await refreshResumes();
    } else {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Resumes | ShieldCV</title>
</svelte:head>

{#if !unlocked}
  <VaultUnlockPanel
    busy={unlockBusy}
    copy="Unlock your on-device vault to create, edit, and import resumes without sending data off-device."
    error={error}
    onUnlock={handleUnlock}
    title="Unlock your resumes"
  />
{:else}
  <section class="content-card resume-list-header">
    <div class="section-header">
      <div>
        <p class="section-kicker">Resume Vault</p>
        <h3>Encrypted resumes on this device</h3>
      </div>

      <div class="header-actions">
        <a class="shell-button shell-button--primary" data-testid="create-resume" href="/resumes/new">
          Create resume
        </a>
        <button class="shell-button" type="button" on:click={handleLock}>Lock vault</button>
      </div>
    </div>

    <p>
      Every resume round-trips through encrypted IndexedDB storage under the <code>resume</code>
      namespace.
    </p>
  </section>

  {#if loading}
    <section class="content-card">
      <p>Loading resumes…</p>
    </section>
  {:else if resumes.length === 0}
    <section class="content-card empty-state" data-testid="empty-resumes">
      <p class="section-kicker">Start Here</p>
      <h3>No resumes yet</h3>
      <p>Create a blank resume or import a PDF after you open one.</p>
      <a class="shell-button shell-button--primary" href="/resumes/new">Create your first resume</a>
    </section>
  {:else}
    <section class="resume-list-grid">
      {#each resumes as resume}
        <article class="content-card resume-card" data-testid={`resume-card-${resume.id}`}>
          <div class="resume-card__header">
            <div>
              <p class="section-kicker">Resume</p>
              <h3>{resume.basics.name || 'Untitled resume'}</h3>
            </div>
            <span class="resume-updated">
              {new Date(resume.updatedAt).toLocaleDateString()}
            </span>
          </div>

          <p class="resume-label">{resume.basics.label || 'No headline yet'}</p>
          <p class="resume-summary">{resume.basics.summary || 'Add a summary to shape your story.'}</p>

          <div class="resume-card__actions">
            <a class="shell-button shell-button--primary" href={`/resumes/${resume.id}`}>Edit</a>
            <button class="shell-button shell-button--danger" type="button" on:click={() => requestDelete(resume.id)}>
              Delete
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}

  <ConfirmDialog
    bind:this={deleteDialog}
    title="Delete this resume?"
    body="This will permanently remove the resume from your encrypted vault. There is no undo."
    onConfirm={confirmDelete}
  />
{/if}
