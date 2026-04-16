<script lang="ts">
  import { tick } from 'svelte';

  type PostureTone = 'success' | 'warning';

  type PostureItem = {
    title: string;
    status: string;
    tone: PostureTone;
    paragraphs: [string, string, string?];
  };

  const items: PostureItem[] = [
    {
      title: 'Local-first',
      status: 'active',
      tone: 'success',
      paragraphs: [
        'Every byte of your resume is meant to stay with you on this device. ShieldCV is built as a static Progressive Web App, so the main interface loads into your browser and keeps working from the local cache instead of depending on a hosted app server.',
        'In the current shell, the browser is locked down to same-origin assets through the Content Security Policy, there are no third-party scripts, and the app does not include analytics, telemetry, or cloud SDKs. That means your resume workflow is designed to happen inside this tab, not on somebody else’s infrastructure.',
        'The goal is simple: ShieldCV should never be in a position to collect your private documents. We do not have a remote database in this shell, and the project is open source so the enforcement can be inspected directly in the code and the response headers.',
      ],
    },
    {
      title: 'Zero server contact',
      status: 'active',
      tone: 'success',
      paragraphs: [
        'After the app shell finishes loading, ShieldCV is designed not to call any third party. No analytics. No telemetry. No error tracking. No cloud AI APIs. The interface you see is served as static files and then runs locally in your browser.',
        'That policy is enforced in two ways right now. First, the app itself does not issue cross-origin fetches for core navigation. Second, the Content Security Policy limits outbound connections to the same origin, which blocks the usual ways trackers and remote scripts try to phone home.',
        'This matters because privacy should not depend on trust alone. Even if someone wanted to add a hidden external request, the browser policy is there to make that harder and more visible.',
      ],
    },
    {
      title: 'Encrypted at rest',
      status: 'pending unlock',
      tone: 'warning',
      paragraphs: [
        'When you create a vault and choose a passphrase, ShieldCV will derive an encryption key from that passphrase with PBKDF2 using 600,000 rounds. Every saved resume will be encrypted with AES-GCM before it touches browser storage.',
        'Once that unlock flow lands, local storage will hold ciphertext instead of readable resume data. If someone inspects browser storage without your passphrase, they should see protected data rather than plain text documents.',
        'This item is still marked pending because the vault unlock screen is not wired into the shell yet. The underlying crypto package already exists in the workspace and is tested, so this status is about the missing user flow, not a missing security design.',
      ],
    },
    {
      title: 'Audit log',
      status: 'pending',
      tone: 'warning',
      paragraphs: [
        'ShieldCV will record security-relevant events in a tamper-evident audit log stored inside the encrypted vault. The plan is for each event to be linked into a hash chain so the history is harder to edit without detection.',
        'Once activity logging is turned on, you will be able to review what happened inside the app and export that record as evidence. That gives you a way to inspect important actions instead of guessing whether a setting changed or a document was modified.',
        'This is still pending in the shell because the event capture and viewer are not connected yet. The audit package already exists in the repo and the hash chain approach is part of the project design, so the groundwork is in place even though the UI is not finished.',
      ],
    },
  ];

  let dialogElement: HTMLDialogElement | null = null;
  let selected: PostureItem | null = null;

  async function openModal(item: PostureItem) {
    selected = item;
    await tick();
    dialogElement?.showModal();
  }

  function closeModal() {
    dialogElement?.close();
    selected = null;
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
    selected = null;
  }
</script>

<section class="posture-card">
  <div class="section-header">
    <div>
      <p class="section-kicker">Security posture</p>
      <h3>What ShieldCV is enforcing right now</h3>
    </div>
  </div>

  <div class="posture-grid">
    {#each items as item}
      <button
        class="posture-item"
        type="button"
        aria-haspopup="dialog"
        aria-controls="posture-dialog"
        on:click={() => openModal(item)}
      >
        <span class={`status-dot ${item.tone}`} aria-hidden="true"></span>
        <span class="posture-copy">
          <strong>{item.title}: {item.status}</strong>
          <span>Tap to see how this is enforced.</span>
        </span>
      </button>
    {/each}
  </div>
</section>

<section class="posture-action">
  <div>
    <p class="section-kicker">Live demo</p>
    <h4>See our defenses in action</h4>
    <p>
      Launch Attack Mode to watch malicious resume payloads get blocked by Trusted Types,
      DOMPurify, CSP, and size guards in real time.
    </p>
  </div>

  <a class="shell-button shell-button--danger posture-action__link" href="/attack-mode">
    Open Attack Mode
  </a>
</section>

<dialog
  bind:this={dialogElement}
  id="posture-dialog"
  class="posture-dialog"
  aria-labelledby="posture-dialog-title"
  aria-describedby="posture-dialog-body"
  on:cancel={handleDialogCancel}
  on:close={handleDialogClose}
  on:click={handleDialogClick}
>
  {#if selected}
    <div class="dialog-header">
      <div>
        <p class="section-kicker">Security detail</p>
        <h4 id="posture-dialog-title">{selected.title}: {selected.status}</h4>
      </div>

      <button
        class="dialog-close"
        type="button"
        aria-label="Close security detail"
        on:click={closeModal}
      >
        ×
      </button>
    </div>

    <div class="dialog-body" id="posture-dialog-body">
      {#each selected.paragraphs as paragraph}
        <p>{paragraph}</p>
      {/each}
    </div>

    <div class="dialog-actions">
      <button class="shell-button shell-button--primary" type="button" on:click={closeModal}>
        Close
      </button>
    </div>
  {/if}
</dialog>

<style>
  .posture-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1rem;
    padding: 1.25rem;
    border: 1px solid color-mix(in srgb, var(--danger) 26%, var(--border));
    border-radius: 1.5rem;
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--danger) 18%, transparent), transparent 42%),
      color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: var(--shadow);
  }

  .posture-action h4 {
    margin: 0 0 0.45rem;
    font-size: 1.15rem;
  }

  .posture-action p {
    margin: 0;
    color: var(--text-soft);
  }

  .posture-action__link {
    flex: none;
    text-decoration: none;
  }

  @media (max-width: 720px) {
    .posture-action {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
