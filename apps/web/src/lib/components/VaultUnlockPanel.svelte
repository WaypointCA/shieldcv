<script lang="ts">
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

  async function submit() {
    await onUnlock(passphrase);
    passphrase = '';
  }
</script>

<section class="content-card vault-panel">
  <p class="section-kicker">Encrypted Storage</p>
  <h3>{title}</h3>
  <p>{copy}</p>

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

    <button
      class="shell-button shell-button--primary"
      data-testid="unlock-vault"
      disabled={busy}
      type="submit"
    >
      {#if busy}Unlocking…{:else}Unlock vault{/if}
    </button>
  </form>
</section>
