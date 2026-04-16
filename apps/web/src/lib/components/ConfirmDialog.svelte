<script lang="ts">
  import { tick } from 'svelte';

  let {
    title,
    body,
    kicker = 'Confirm action',
    destructiveLabel = 'Delete',
    cancelLabel = 'Cancel',
    confirmTestId = 'confirm-delete',
    busy = false,
    onCancel,
    onConfirm,
  }: {
    title: string;
    body: string;
    kicker?: string;
    destructiveLabel?: string;
    cancelLabel?: string;
    confirmTestId?: string;
    busy?: boolean;
    onCancel?: () => void;
    onConfirm: () => Promise<void> | void;
  } = $props();

  let dialogElement: HTMLDialogElement | null = null;
  let cancelButton = $state<HTMLButtonElement | null>(null);
  let open = $state(false);

  export async function showModal() {
    open = true;
    await tick();
    dialogElement?.showModal();
    cancelButton?.focus();
  }

  function closeModal(notifyCancel = true) {
    dialogElement?.close();
    open = false;
    if (notifyCancel) {
      onCancel?.();
    }
  }

  function handleDialogCancel(event: Event) {
    event.preventDefault();
    closeModal();
  }

  function handleDialogClick(event: MouseEvent) {
    if (event.target === dialogElement) {
      closeModal();
    }
  }

  function handleDialogClose() {
    open = false;
  }

  function handleCancelClick() {
    closeModal();
  }

  async function confirm() {
    await onConfirm();
    closeModal(false);
  }
</script>

<dialog
  bind:this={dialogElement}
  class="posture-dialog"
  aria-labelledby="confirm-dialog-title"
  aria-describedby="confirm-dialog-body"
  oncancel={handleDialogCancel}
  onclose={handleDialogClose}
  onclick={handleDialogClick}
>
  {#if open}
    <div class="dialog-header">
      <div>
        <p class="section-kicker">{kicker}</p>
        <h4 id="confirm-dialog-title">{title}</h4>
      </div>

      <button
        class="dialog-close"
        type="button"
        aria-label="Close confirmation dialog"
        onclick={handleCancelClick}
      >
        ×
      </button>
    </div>

    <div class="dialog-body" id="confirm-dialog-body">
      <p>{body}</p>
    </div>

    <div class="dialog-actions">
      <button bind:this={cancelButton} class="shell-button" type="button" onclick={handleCancelClick}>
        {cancelLabel}
      </button>
      <button
        class="shell-button shell-button--danger"
        data-testid={confirmTestId}
        disabled={busy}
        type="button"
        onclick={confirm}
      >
        {#if busy}Deleting…{:else}{destructiveLabel}{/if}
      </button>
    </div>
  {/if}
</dialog>
