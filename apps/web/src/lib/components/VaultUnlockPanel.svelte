<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { destroyVault, hasExistingVault } from '$lib/resume-vault';

  let {
    title = 'Unlock your resume vault',
    copy = 'Enter your passphrase to decrypt resumes stored on this device.',
    busy = false,
    error = '',
    onUnlock,
  }: {
    title?: string;
    copy?: string;
    busy?: boolean;
    error?: string;
    onUnlock: (passphrase: string) => Promise<void>;
  } = $props();

  let passphrase = $state('');
  let resetBusy = $state(false);
  let resetSuccess = $state('');
  let hasVault = $state<boolean | null>(null);
  let resetDialog = $state<{ showModal: () => Promise<void> } | null>(null);

  const createTitle = 'Create your resume vault';
  const createCopy = 'Choose a passphrase to create a new encrypted vault on this device.';

  let vaultKnown = $derived(hasVault !== null);
  let resolvedTitle = $derived(hasVault === false ? createTitle : title);
  let resolvedCopy = $derived(hasVault === false ? createCopy : copy);

  async function submit() {
    await onUnlock(passphrase);
    passphrase = '';
  }

  function openResetDialog() {
    void resetDialog?.showModal();
  }

  async function confirmReset() {
    resetBusy = true;

    try {
      await destroyVault();
      passphrase = '';
      hasVault = false;
      resetSuccess = 'Vault reset complete. You can now create a new vault with a new passphrase.';
      window.setTimeout(() => {
        void goto('/', { replaceState: true }).catch(() => {
          window.location.reload();
        });
      }, 1200);
    } finally {
      resetBusy = false;
    }
  }

  onMount(() => {
    void hasExistingVault().then((existingVault) => {
      hasVault = existingVault;
    });
  });
</script>

<section class="content-card vault-panel">
  <p class="section-kicker">Encrypted Storage</p>
  <h3>{resolvedTitle}</h3>
  <p>{resolvedCopy}</p>

  <form class="stack-form" onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}>
    <label class="field">
      <span>Passphrase</span>
      <input
        bind:value={passphrase}
        autocomplete="current-password"
        class="field-input"
        data-testid="vault-passphrase"
        placeholder="Enter vault passphrase"
        required
        type="password"
      />
    </label>

    {#if error}
      <p class="field-error" data-testid="vault-error">{error}</p>
    {/if}

    {#if resetSuccess}
      <p class="vault-reset-success" data-testid="vault-reset-success" role="status">{resetSuccess}</p>
    {/if}

    <button
      class="shell-button shell-button--primary"
      data-testid="unlock-vault"
      disabled={busy || resetBusy || !vaultKnown}
      type="submit"
    >
      {#if !vaultKnown}
        Checking vault…
      {:else if busy}
        Unlocking…
      {:else if !hasVault}
        Create vault
      {:else}
        Unlock vault
      {/if}
    </button>

    {#if hasVault === true}
      <button
        class="vault-reset-link"
        data-testid="forgot-passphrase"
        disabled={resetBusy}
        type="button"
        onclick={openResetDialog}
      >
        Forgot your passphrase?
      </button>
    {/if}
  </form>
</section>

<ConfirmDialog
  bind:this={resetDialog}
  body={`If you forgot your passphrase, your encrypted data cannot be recovered. ShieldCV uses local encryption with no server backup. Resetting the vault will permanently delete all stored resumes, scan history, and audit logs. You will create a new vault with a new passphrase.\n\nThis action cannot be undone.`}
  busy={resetBusy}
  confirmTestId="confirm-reset-vault"
  destructiveLabel="Delete all data and reset"
  kicker="Reset vault"
  title="Reset Vault"
  onConfirm={confirmReset}
/>

<style>
  .vault-reset-link {
    justify-self: start;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .vault-reset-link:disabled {
    color: var(--text-muted);
    text-decoration: none;
  }

  .vault-reset-success {
    margin: 0;
    color: var(--success);
  }
</style>
