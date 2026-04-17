<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BriefcaseBusiness,
    ClipboardList,
    Copy,
    Eraser,
    LockKeyhole,
    Mail,
    Pencil,
    Search,
    Trash2,
  } from 'lucide-svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import {
    createTrackerApplication,
    isVaultUnlocked,
    listResumes,
    listTrackerApplications,
    removeTrackerApplication,
    unlockVault,
    updateTrackerApplication,
    vaultStatus,
  } from '$lib/resume-vault';
  import type { ResumeDocument } from '@shieldcv/resume';
  import {
    calculateDeadline,
    createTrackerApplicationRecord,
    generateDsarEmail,
    generateErasureEmail,
    type ApplicationStatus,
    type TrackerApplicationRecord,
  } from '@shieldcv/compliance';

  type ConfirmDialogHandle = { showModal: () => Promise<void> };

  type TrackerForm = {
    company: string;
    platform: string;
    positionTitle: string;
    dateApplied: string;
    notes: string;
  };

  const platformOptions = [
    'LinkedIn',
    'Indeed',
    'Glassdoor',
    'Handshake',
    'Workday',
    'Greenhouse',
    'Lever',
    'iCIMS',
    'Company Website',
    'Job Fair',
    'Referral',
    'Other',
  ] as const;

  const statusOptions: Array<{ value: ApplicationStatus; label: string }> = [
    { value: 'applied', label: 'Applied' },
    { value: 'screening', label: 'Screening' },
    { value: 'interview', label: 'Interview' },
    { value: 'offer', label: 'Offer' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ];

  const statusLabels = Object.fromEntries(statusOptions.map((option) => [option.value, option.label])) as Record<
    ApplicationStatus,
    string
  >;

  let applications: TrackerApplicationRecord[] = [];
  let resumes: ResumeDocument[] = [];
  let loading = true;
  let unlockBusy = false;
  let saving = false;
  let deleting = false;
  let unlocked = false;
  let error = '';
  let statusMessage = '';
  let search = '';
  let selectedIdentityResumeId = '';
  let editingId: string | null = null;
  let deletingId: string | null = null;
  let deleteDialog: ConfirmDialogHandle | null = null;
  let filteredApplications: TrackerApplicationRecord[] = [];
  let totalApplications = 0;
  let appliedCount = 0;
  let interviewingCount = 0;
  let offerCount = 0;
  let thisWeekCount = 0;
  let thisMonthCount = 0;

  let form: TrackerForm = defaultForm();
  let editForm: TrackerForm & { status: ApplicationStatus } = defaultEditForm();

  function todayValue(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function defaultForm(): TrackerForm {
    return {
      company: '',
      platform: 'LinkedIn',
      positionTitle: '',
      dateApplied: todayValue(),
      notes: '',
    };
  }

  function defaultEditForm(): TrackerForm & { status: ApplicationStatus } {
    return {
      ...defaultForm(),
      status: 'applied',
    };
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function applicationIdentity(): { userName: string; userEmail: string } {
    const selectedResume = resumes.find((resume) => resume.id === selectedIdentityResumeId);
    const resume = selectedResume ?? resumes[0];

    return {
      userName: resume?.basics.name || 'Resume Applicant',
      userEmail: resume?.basics.email || 'candidate@example.com',
    };
  }

  function resetForm(): void {
    form = defaultForm();
  }

  function beginEdit(record: TrackerApplicationRecord): void {
    editingId = record.id;
    editForm = {
      company: record.company,
      platform: record.platform,
      positionTitle: record.positionTitle,
      dateApplied: record.dateApplied.slice(0, 10),
      notes: record.notes,
      status: record.status,
    };
  }

  function cancelEdit(): void {
    editingId = null;
    editForm = defaultEditForm();
  }

  function requestDelete(id: string): void {
    deletingId = id;
    void deleteDialog?.showModal();
  }

  function matchesSearch(record: TrackerApplicationRecord): boolean {
    if (!search.trim()) {
      return true;
    }

    const query = search.trim().toLowerCase();
    return (
      record.company.toLowerCase().includes(query) ||
      record.platform.toLowerCase().includes(query)
    );
  }

  function isThisWeek(dateApplied: string): boolean {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - now.getDay());
    return new Date(dateApplied).getTime() >= start.getTime();
  }

  function isThisMonth(dateApplied: string): boolean {
    const applied = new Date(dateApplied);
    const now = new Date();
    return (
      applied.getFullYear() === now.getFullYear() &&
      applied.getMonth() === now.getMonth()
    );
  }

  async function copyText(value: string, successMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      statusMessage = successMessage;
    } catch {
      statusMessage = 'Clipboard access was unavailable. Copy the text manually.';
    }
  }

  async function refreshTracker(): Promise<void> {
    loading = true;

    try {
      const [nextApplications, nextResumes] = await Promise.all([
        listTrackerApplications(),
        listResumes(),
      ]);
      applications = nextApplications;
      resumes = nextResumes;

      if (!selectedIdentityResumeId && nextResumes[0]) {
        selectedIdentityResumeId = nextResumes[0].id;
      }

      unlocked = true;
      error = '';
    } finally {
      loading = false;
    }
  }

  async function handleUnlock(passphrase: string): Promise<void> {
    unlockBusy = true;

    try {
      await unlockVault(passphrase);
      await refreshTracker();
    } catch (unlockError) {
      error = unlockError instanceof Error ? unlockError.message : 'Unable to unlock the tracker.';
    } finally {
      unlockBusy = false;
    }
  }

  async function addApplication(): Promise<void> {
    if (!form.company.trim() || !form.positionTitle.trim()) {
      error = 'Company name and position title are required.';
      return;
    }

    saving = true;

    try {
      error = '';
      const record = createTrackerApplicationRecord(form.platform, form.company, form.positionTitle);
      await createTrackerApplication({
        ...record,
        dateApplied: new Date(`${form.dateApplied}T00:00:00.000Z`).toISOString(),
        notes: form.notes.trim(),
      });
      await refreshTracker();
      resetForm();
      statusMessage = 'Application added to your encrypted tracker.';
    } finally {
      saving = false;
    }
  }

  async function saveEdit(record: TrackerApplicationRecord): Promise<void> {
    if (!editForm.company.trim() || !editForm.positionTitle.trim()) {
      error = 'Company name and position title are required.';
      return;
    }

    saving = true;

    try {
      error = '';
      await updateTrackerApplication({
        ...record,
        company: editForm.company.trim(),
        platform: editForm.platform,
        positionTitle: editForm.positionTitle.trim(),
        dateApplied: new Date(`${editForm.dateApplied}T00:00:00.000Z`).toISOString(),
        notes: editForm.notes.trim(),
        status: editForm.status,
      });
      await refreshTracker();
      cancelEdit();
      statusMessage = 'Application updated.';
    } finally {
      saving = false;
    }
  }

  async function updateStatus(record: TrackerApplicationRecord, status: ApplicationStatus): Promise<void> {
    error = '';
    await updateTrackerApplication({
      ...record,
      status,
    });
    await refreshTracker();
    statusMessage = `Status changed to ${statusLabels[status]}.`;
  }

  async function confirmDelete(): Promise<void> {
    if (!deletingId) {
      return;
    }

    deleting = true;

    try {
      error = '';
      await removeTrackerApplication(deletingId);
      deletingId = null;
      await refreshTracker();
      statusMessage = 'Application deleted from the encrypted tracker.';
    } finally {
      deleting = false;
    }
  }

  async function generatePrivacyEmail(
    record: TrackerApplicationRecord,
    kind: 'dsar' | 'erasure',
  ): Promise<void> {
    const identity = applicationIdentity();
    const template =
      kind === 'dsar'
        ? generateDsarEmail(record, identity.userName, identity.userEmail)
        : generateErasureEmail(record, identity.userName, identity.userEmail);

    await copyText(
      `${template.subject}\n\n${template.body}`,
      `${kind === 'dsar' ? 'DSAR' : 'Erasure request'} copied for ${record.company}.`,
    );

    const now = new Date().toISOString();
    await updateTrackerApplication(
      kind === 'dsar'
        ? {
            ...record,
            dsarSent: true,
            dsarSentDate: now,
            dsarDeadline: calculateDeadline(now),
          }
        : {
            ...record,
            erasureRequested: true,
            erasureDate: now,
          },
    );
    await refreshTracker();
  }

  onMount(async () => {
    unlocked = await isVaultUnlocked();

    if (unlocked) {
      await refreshTracker();
    } else {
      loading = false;
    }
  });

  $: unlocked = $vaultStatus === 'unlocked';
  $: filteredApplications = applications.filter(matchesSearch);
  $: totalApplications = applications.length;
  $: appliedCount = applications.filter((record) => record.status === 'applied').length;
  $: interviewingCount = applications.filter((record) =>
    record.status === 'screening' || record.status === 'interview'
  ).length;
  $: offerCount = applications.filter((record) => record.status === 'offer').length;
  $: thisWeekCount = applications.filter((record) => isThisWeek(record.dateApplied)).length;
  $: thisMonthCount = applications.filter((record) => isThisMonth(record.dateApplied)).length;
</script>

<svelte:head>
  <title>Application Tracker | ShieldCV</title>
</svelte:head>

{#if !unlocked}
  <VaultUnlockPanel
    busy={unlockBusy}
    copy="Unlock your on-device vault to track applications, manage statuses, and generate GDPR request templates."
    error={error}
    onUnlock={handleUnlock}
    title="Unlock your tracker"
  />
{:else}
  <section class="content-card tracker-hero">
    <div class="section-header">
      <div>
        <p class="section-kicker">Encrypted Job Search Log</p>
        <h3>Application Tracker</h3>
      </div>
      <ClipboardList size={20} />
    </div>

    <p class="tracker-subtitle">Track where your resume goes. Know your rights.</p>

    <div class="tracker-stats">
      <article class="tracker-stat">
        <span>Total applications</span>
        <strong>{totalApplications}</strong>
      </article>
      <article class="tracker-stat">
        <span>By status</span>
        <strong>{appliedCount} applied, {interviewingCount} interviewing, {offerCount} offers</strong>
      </article>
      <article class="tracker-stat">
        <span>Recent activity</span>
        <strong>{thisWeekCount} this week, {thisMonthCount} this month</strong>
      </article>
    </div>

    <p class="tracker-privacy-note">
      Your application data is encrypted and stored locally in your browser. It is never sent to any server.
    </p>
  </section>

  <section class="tracker-layout">
    <article class="content-card tracker-panel">
      <div class="section-header">
        <div>
          <p class="section-kicker">Add Application</p>
          <h3>Keep the full trail</h3>
        </div>
        <BriefcaseBusiness size={18} />
      </div>

      <form class="tracker-form" on:submit|preventDefault={addApplication}>
        <label class="field">
          <span>Company name</span>
          <input class="field-input" bind:value={form.company} required />
        </label>

        <label class="field">
          <span>Platform / source</span>
          <select class="field-input" bind:value={form.platform}>
            {#each platformOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Position title</span>
          <input class="field-input" bind:value={form.positionTitle} required />
        </label>

        <label class="field">
          <span>Date applied</span>
          <input class="field-input" bind:value={form.dateApplied} type="date" />
        </label>

        <label class="field tracker-form__notes">
          <span>Notes</span>
          <textarea class="field-input field-textarea" bind:value={form.notes}></textarea>
        </label>

        <button
          class="shell-button shell-button--primary"
          data-testid="tracker-add-application"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Adding…' : 'Add Application'}
        </button>
      </form>
    </article>

    <article class="content-card tracker-panel">
      <div class="section-header">
        <div>
          <p class="section-kicker">Privacy Templates</p>
          <h3>Use resume identity when available</h3>
        </div>
        <LockKeyhole size={18} />
      </div>

      <label class="field">
        <span>Identity source</span>
        <select class="field-input" bind:value={selectedIdentityResumeId}>
          {#if resumes.length === 0}
            <option value="">No resumes stored yet</option>
          {:else}
            {#each resumes as resume}
              <option value={resume.id}>{resume.basics.name || 'Untitled resume'}</option>
            {/each}
          {/if}
        </select>
      </label>

      <p class="tracker-help">
        DSAR and erasure emails use the selected resume’s stored name and email when available. If you
        have not saved a resume yet, the template falls back to generic placeholders.
      </p>
    </article>
  </section>

  <section class="content-card tracker-panel">
    <div class="section-header tracker-results__header">
      <div>
        <p class="section-kicker">Application List</p>
        <h3>Search, update, and follow up</h3>
      </div>

      <label class="field tracker-search">
        <span class="sr-only">Search applications</span>
        <div class="tracker-search__input">
          <Search size={16} />
          <input
            class="field-input tracker-search__field"
            bind:value={search}
            placeholder="Search by company or platform"
          />
        </div>
      </label>
    </div>

    {#if error}
      <p class="field-error" role="alert">{error}</p>
    {/if}

    {#if statusMessage}
      <p class="scan-status" role="status">{statusMessage}</p>
    {/if}

    {#if loading}
      <p>Loading applications…</p>
    {:else if filteredApplications.length === 0}
      <p>No matching applications yet. Add one above to start tracking your job search.</p>
    {:else}
      <div class="tracker-table-wrap">
        <table class="scan-table tracker-table" data-testid="tracker-application-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Position</th>
              <th>Platform</th>
              <th>Date Applied</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredApplications as record}
              {#if editingId === record.id}
                <tr>
                  <td><input class="field-input tracker-inline-input" bind:value={editForm.company} /></td>
                  <td><input class="field-input tracker-inline-input" bind:value={editForm.positionTitle} /></td>
                  <td>
                    <select class="field-input tracker-inline-input" bind:value={editForm.platform}>
                      {#each platformOptions as option}
                        <option value={option}>{option}</option>
                      {/each}
                    </select>
                  </td>
                  <td><input class="field-input tracker-inline-input" bind:value={editForm.dateApplied} type="date" /></td>
                  <td>
                    <select class="field-input tracker-inline-input" bind:value={editForm.status}>
                      {#each statusOptions as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <div class="tracker-actions">
                      <button class="shell-button shell-button--primary" type="button" on:click={() => saveEdit(record)}>
                        Save
                      </button>
                      <button class="shell-button" type="button" on:click={cancelEdit}>Cancel</button>
                    </div>
                    <textarea class="field-input field-textarea tracker-inline-notes" bind:value={editForm.notes} placeholder="Notes"></textarea>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td>{record.company}</td>
                  <td>{record.positionTitle || 'Untitled role'}</td>
                  <td>{record.platform}</td>
                  <td>{formatDate(record.dateApplied)}</td>
                  <td>
                    <select
                      class="field-input tracker-status-select"
                      value={record.status}
                      on:change={(event) => updateStatus(record, (event.currentTarget as HTMLSelectElement).value as ApplicationStatus)}
                    >
                      {#each statusOptions as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <div class="tracker-actions">
                      <button class="shell-button" type="button" on:click={() => beginEdit(record)}>
                        <Pencil size={16} />
                        <span>Edit</span>
                      </button>
                      <button class="shell-button shell-button--danger" type="button" on:click={() => requestDelete(record.id)}>
                        <Trash2 size={16} />
                        <span>Delete</span>
                      </button>
                      <button
                        class="shell-button shell-button--primary"
                        data-testid={`tracker-dsar-${record.id}`}
                        type="button"
                        on:click={() => generatePrivacyEmail(record, 'dsar')}
                      >
                        <Mail size={16} />
                        <span>Generate DSAR</span>
                        <small class="tracker-gdpr-tag">GDPR</small>
                      </button>
                      <button
                        class="shell-button"
                        data-testid={`tracker-erasure-${record.id}`}
                        type="button"
                        on:click={() => generatePrivacyEmail(record, 'erasure')}
                      >
                        <Eraser size={16} />
                        <span>Request Erasure</span>
                        <small class="tracker-gdpr-tag">GDPR</small>
                      </button>
                    </div>
                    {#if record.notes}
                      <p class="tracker-notes">{record.notes}</p>
                    {/if}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>

      <div class="tracker-card-list" data-testid="tracker-application-cards">
        {#each filteredApplications as record}
          <article class="entry-card">
            {#if editingId === record.id}
              <div class="tracker-card-grid">
                <label class="field">
                  <span>Company</span>
                  <input class="field-input" bind:value={editForm.company} />
                </label>
                <label class="field">
                  <span>Position</span>
                  <input class="field-input" bind:value={editForm.positionTitle} />
                </label>
                <label class="field">
                  <span>Platform</span>
                  <select class="field-input" bind:value={editForm.platform}>
                    {#each platformOptions as option}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                </label>
                <label class="field">
                  <span>Date applied</span>
                  <input class="field-input" bind:value={editForm.dateApplied} type="date" />
                </label>
                <label class="field">
                  <span>Status</span>
                  <select class="field-input" bind:value={editForm.status}>
                    {#each statusOptions as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </label>
                <label class="field">
                  <span>Notes</span>
                  <textarea class="field-input field-textarea" bind:value={editForm.notes}></textarea>
                </label>
              </div>

              <div class="tracker-actions">
                <button class="shell-button shell-button--primary" type="button" on:click={() => saveEdit(record)}>
                  Save
                </button>
                <button class="shell-button" type="button" on:click={cancelEdit}>Cancel</button>
              </div>
            {:else}
              <div class="entry-card__header">
                <div>
                  <p class="section-kicker">{record.platform}</p>
                  <h3>{record.company}</h3>
                </div>
                <span class="tracker-date">{formatDate(record.dateApplied)}</span>
              </div>

              <p class="tracker-position">{record.positionTitle || 'Untitled role'}</p>

              <label class="field">
                <span>Status</span>
                <select
                  class="field-input"
                  value={record.status}
                  on:change={(event) => updateStatus(record, (event.currentTarget as HTMLSelectElement).value as ApplicationStatus)}
                >
                  {#each statusOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>

              {#if record.notes}
                <p class="tracker-notes">{record.notes}</p>
              {/if}

              <div class="tracker-actions">
                <button class="shell-button" type="button" on:click={() => beginEdit(record)}>
                  <Pencil size={16} />
                  <span>Edit</span>
                </button>
                <button class="shell-button shell-button--danger" type="button" on:click={() => requestDelete(record.id)}>
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
                <button class="shell-button shell-button--primary" type="button" on:click={() => generatePrivacyEmail(record, 'dsar')}>
                  <Mail size={16} />
                  <span>Generate DSAR</span>
                  <small class="tracker-gdpr-tag">GDPR</small>
                </button>
                <button class="shell-button" type="button" on:click={() => generatePrivacyEmail(record, 'erasure')}>
                  <Copy size={16} />
                  <span>Request Erasure</span>
                  <small class="tracker-gdpr-tag">GDPR</small>
                </button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <ConfirmDialog
    bind:this={deleteDialog}
    busy={deleting}
    body="This will permanently remove the application from your encrypted tracker. There is no undo."
    destructiveLabel="Delete application"
    onConfirm={confirmDelete}
    title="Delete this application?"
  />
{/if}

<style>
  .tracker-subtitle {
    margin: 0;
    font-size: 1.05rem;
  }

  .tracker-layout,
  .tracker-stats,
  .tracker-card-grid {
    display: grid;
    gap: 1rem;
  }

  .tracker-stat {
    display: grid;
    gap: 0.35rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 1.15rem;
    background: var(--bg-muted);
  }

  .tracker-stat span,
  .tracker-help,
  .tracker-notes,
  .tracker-date,
  .tracker-privacy-note {
    color: var(--text-muted);
  }

  .tracker-stat strong {
    color: var(--text);
    font-size: 1.05rem;
  }

  .tracker-panel,
  .tracker-form {
    display: grid;
    gap: 1rem;
  }

  .tracker-search {
    min-width: min(100%, 20rem);
  }

  .tracker-search__input {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 0.9rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-muted);
  }

  .tracker-search__field {
    border: 0;
    background: transparent;
    padding-left: 0;
  }

  .tracker-results__header {
    align-items: end;
  }

  .tracker-table-wrap {
    display: none;
    overflow-x: auto;
  }

  .tracker-table td:last-child {
    min-width: 24rem;
  }

  .tracker-inline-input {
    min-width: 9rem;
    min-height: 2.6rem;
    padding: 0.7rem 0.8rem;
  }

  .tracker-inline-notes {
    margin-top: 0.75rem;
  }

  .tracker-card-list {
    display: grid;
    gap: 1rem;
  }

  .tracker-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .tracker-gdpr-tag {
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning) 16%, transparent);
    color: var(--warning);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .tracker-position {
    margin: 0;
    color: var(--text);
    font-weight: 600;
  }

  .tracker-notes {
    margin: 0;
    line-height: 1.6;
    white-space: pre-line;
  }

  .tracker-status-select {
    min-width: 9rem;
    min-height: 2.5rem;
    padding: 0.55rem 0.75rem;
  }

  @media (min-width: 720px) {
    .tracker-layout,
    .tracker-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 960px) {
    .tracker-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .tracker-table-wrap {
      display: block;
    }

    .tracker-card-list {
      display: none;
    }
  }
</style>
