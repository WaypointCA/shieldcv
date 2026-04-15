<script lang="ts">
  import { tick } from 'svelte';

  let {
    title,
    body,
    destructiveLabel = 'Delete',
    cancelLabel = 'Cancel',
    busy = false,
    onConfirm,
  }: {
    title: string;
    body: string;
    destructiveLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
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

  function closeModal() {
    dialogElement?.close();
    open = false;
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

  async function confirm() {
    await onConfirm();
    closeModal();
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
        <p class="section-kicker">Confirm action</p>
        <h4 id="confirm-dialog-title">{title}</h4>
      </div>

      <button
        class="dialog-close"
        type="button"
        aria-label="Close confirmation dialog"
        onclick={closeModal}
      >
        ×
      </button>
    </div>

    <div class="dialog-body" id="confirm-dialog-body">
      <p>{body}</p>
    </div>

    <div class="dialog-actions">
      <button bind:this={cancelButton} class="shell-button" type="button" onclick={closeModal}>
        {cancelLabel}
      </button>
      <button
        class="shell-button shell-button--danger"
        data-testid="confirm-delete"
        disabled={busy}
        type="button"
        onclick={confirm}
      >
        {#if busy}Deleting…{:else}{destructiveLabel}{/if}
      </button>
    </div>
  {/if}
</dialog>
