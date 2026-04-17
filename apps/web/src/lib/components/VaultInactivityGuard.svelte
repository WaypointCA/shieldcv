<script lang="ts">
  import { onMount } from 'svelte';
  import { createInactivityTimer, INACTIVITY_TIMEOUT_MS } from '$lib/inactivity';
  import { lockVault, vaultStatus } from '$lib/resume-vault';

  let notice = '';

  onMount(() => {
    const inactivityTimer = createInactivityTimer({
      target: document,
      timeoutMs: INACTIVITY_TIMEOUT_MS,
      onTimeout: async () => {
        try {
          await lockVault({ reason: 'inactivity' });
          notice = 'Vault locked due to inactivity';
          window.setTimeout(() => {
            notice = '';
          }, 5000);
        } catch (error) {
          console.warn('Unable to auto-lock the vault after inactivity.', error);
        }
      },
    });

    const unsubscribe = vaultStatus.subscribe((status) => {
      if (status === 'unlocked') {
        inactivityTimer.start();
      } else {
        inactivityTimer.stop();
      }
    });

    return () => {
      unsubscribe();
      inactivityTimer.stop();
    };
  });
</script>

{#if notice}
  <div class="vault-inactivity-toast" role="status" aria-live="polite">
    {notice}
  </div>
{/if}

<style>
  .vault-inactivity-toast {
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 999px;
    bottom: 1.25rem;
    color: #f8fafc;
    left: 50%;
    max-width: calc(100vw - 2rem);
    padding: 0.8rem 1.1rem;
    position: fixed;
    transform: translateX(-50%);
    z-index: 60;
  }

  :global(:root:not([data-theme='light'])) .vault-inactivity-toast {
    background: rgba(15, 23, 42, 0.96);
    border-color: rgba(96, 165, 250, 0.25);
  }
</style>
