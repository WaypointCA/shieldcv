<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import {
    createBlankResume,
    normalizeResumeDocument,
    type ResumeCertification,
    type ResumeDocument,
    type ResumeEducation,
    type ResumeProject,
    type ResumeSkill,
    type ResumeWork,
  } from '@shieldcv/resume';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import { parsePdfTextToResume } from '$lib/resume-import';
  import { deleteResume, getResume, isVaultUnlocked, saveResume, unlockVault } from '$lib/resume-vault';

  const resumeId = page.params.id;
  type ConfirmDialogHandle = { showModal: () => Promise<void> };

  let resume = $state(createBlankResume(resumeId));
  let loading = $state(true);
  let saving = $state(false);
  let deleting = $state(false);
  let importBusy = $state(false);
  let workerReady = $state(false);
  let pendingPdfFile = $state<File | null>(null);
  let unlocked = $state(false);
  let unlockBusy = $state(false);
  let error = $state('');
  let saveStatus = $state<'saved' | 'saving' | 'failed'>('saved');
  let saveError = $state('');
  let dirty = $state(false);
  let saveRequest = $state(0);
  let lastSavedAt = $state<Date | null>(null);
  let lastSavedSnapshot = $state('');
  let now = $state(Date.now());
  let importMessage = $state('Upload a PDF to extract text in an isolated sandbox.');
  let frame = $state<HTMLIFrameElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let deleteDialog = $state<ConfirmDialogHandle | null>(null);

  function createWork(): ResumeWork {
    return {
      id: globalThis.crypto.randomUUID(),
      name: '',
      position: '',
      url: '',
      startDate: '',
      endDate: '',
      summary: '',
      highlights: [],
    };
  }

  function createEducation(): ResumeEducation {
    return {
      id: globalThis.crypto.randomUUID(),
      institution: '',
      url: '',
      area: '',
      studyType: '',
      startDate: '',
      endDate: '',
      score: '',
      courses: [],
    };
  }

  function createSkill(): ResumeSkill {
    return {
      id: globalThis.crypto.randomUUID(),
      name: '',
      level: '',
      keywords: [],
    };
  }

  function createProject(): ResumeProject {
    return {
      id: globalThis.crypto.randomUUID(),
      name: '',
      description: '',
      highlights: [],
      keywords: [],
      startDate: '',
      endDate: '',
      url: '',
      roles: [],
      entity: '',
      type: '',
    };
  }

  function createCertification(): ResumeCertification {
    return {
      id: globalThis.crypto.randomUUID(),
      name: '',
      issuer: '',
      date: '',
      url: '',
    };
  }

  function csvToArray(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function linesToArray(value: string): string[] {
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function arrayToCsv(values: string[]): string {
    return values.join(', ');
  }

  function arrayToLines(values: string[]): string {
    return values.join('\n');
  }

  function extractPdfTextFallback(buffer: ArrayBuffer): string {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
    const matches = Array.from(raw.matchAll(/\(([^()]*)\)/g), (match) => match[1]?.trim() ?? '');
    return matches.filter(Boolean).join('\n');
  }

  function snapshotResume(document: ResumeDocument): string {
    return JSON.stringify(normalizeResumeDocument(document));
  }

  function scheduleAutosave() {
    if (!unlocked || loading || error) {
      return;
    }

    dirty = snapshotResume(resume) !== lastSavedSnapshot;

    if (dirty) {
      saveRequest += 1;
    }
  }

  function markResumeClean(document: ResumeDocument) {
    lastSavedSnapshot = snapshotResume(document);
    dirty = false;
    lastSavedAt = new Date();
    now = Date.now();
  }

  function relativeSavedTime() {
    if (!lastSavedAt) {
      return 'just now';
    }

    const seconds = Math.max(0, Math.floor((now - lastSavedAt.getTime()) / 1_000));

    if (seconds < 2) {
      return 'just now';
    }

    if (seconds < 60) {
      return `${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  async function persistResume() {
    if (!dirty || saving) {
      return;
    }

    const saveStartedAt = Date.now();
    saving = true;
    saveStatus = 'saving';
    saveError = '';

    try {
      const savedResume = await saveResume(resume);
      const minimumSavingDuration = 300;
      const elapsed = Date.now() - saveStartedAt;

      if (elapsed < minimumSavingDuration) {
        await new Promise((resolve) => window.setTimeout(resolve, minimumSavingDuration - elapsed));
      }

      resume = savedResume;
      markResumeClean(savedResume);
      saveStatus = 'saved';
    } catch (saveFailure) {
      saveStatus = 'failed';
      saveError = saveFailure instanceof Error ? saveFailure.message : 'Unable to save this resume.';
    } finally {
      saving = false;
    }
  }

  async function loadResume() {
    loading = true;
    const storedResume = await getResume(resumeId);
    loading = false;

    if (storedResume) {
      resume = normalizeResumeDocument(storedResume);
      markResumeClean(resume);
      saveStatus = 'saved';
    } else {
      error = 'Resume not found in the encrypted vault.';
    }
  }

  async function handleUnlock(passphrase: string) {
    unlockBusy = true;

    try {
      await unlockVault(passphrase);
      unlocked = true;
      error = '';
      await loadResume();
    } catch (unlockError) {
      error = unlockError instanceof Error ? unlockError.message : 'Unable to unlock the resume vault.';
      loading = false;
    } finally {
      unlockBusy = false;
    }
  }

  async function handleSave() {
    dirty = snapshotResume(resume) !== lastSavedSnapshot;
    await persistResume();
  }

  function requestDelete() {
    void deleteDialog?.showModal();
  }

  async function confirmDelete() {
    deleting = true;

    try {
      await deleteResume(resume.id);
      await goto('/resumes');
    } finally {
      deleting = false;
    }
  }

  $effect(() => {
    const request = saveRequest;

    if (!request || !dirty || !unlocked || loading || error) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistResume();
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  });

  async function sendPdfToSandbox(file: File) {
    const frameWindow = frame?.contentWindow;

    if (!workerReady || frameWindow === null || frameWindow === undefined) {
      pendingPdfFile = file;
      importMessage = 'PDF sandbox is still loading. Your import will begin automatically.';
      return;
    }

    pendingPdfFile = null;
    importBusy = true;
    importMessage = `Parsing ${file.name} inside the sandboxed iframe…`;

    const buffer = await file.arrayBuffer();
    const fallbackText = extractPdfTextFallback(buffer);
    frameWindow.postMessage({ type: 'parse-pdf', fileName: file.name, buffer }, '*', [buffer]);

    window.setTimeout(() => {
      if (importBusy && fallbackText) {
        resume = parsePdfTextToResume(fallbackText, resume);
        scheduleAutosave();
        importBusy = false;
        importMessage = 'Imported text from 1 page. Review the fields, then save.';
      }
    }, 1_500);
  }

  async function handleFileSelection(fileList: FileList | null) {
    const file = fileList?.item(0);

    if (file && file.type === 'application/pdf') {
      await sendPdfToSandbox(file);
    } else if (file) {
      importMessage = 'Only PDF files are supported for import.';
    }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    await handleFileSelection(event.dataTransfer?.files ?? null);
  }

  function handleFrameMessage(event: MessageEvent) {
    if (typeof event.data !== 'object' || event.data === null) {
      return;
    }

    const data = event.data as { type?: string; text?: string; error?: string; pages?: number };

    if (data.type === 'pdf-worker-ready') {
      workerReady = true;

      if (pendingPdfFile) {
        void sendPdfToSandbox(pendingPdfFile);
      }

      return;
    }

    if (data.type === 'pdf-text-result' && typeof data.text === 'string') {
      resume = parsePdfTextToResume(data.text, resume);
      scheduleAutosave();
      importBusy = false;
      importMessage = `Imported text from ${data.pages ?? 0} page${data.pages === 1 ? '' : 's'}. Review the fields, then save.`;
      return;
    }

    if (data.type === 'pdf-text-error') {
      importBusy = false;
      importMessage = data.error ?? 'Unable to import this PDF.';
    }
  }

  function handleFrameLoad() {
    workerReady = true;

    if (pendingPdfFile) {
      void sendPdfToSandbox(pendingPdfFile);
    }
  }

  onMount(() => {
    window.addEventListener('message', handleFrameMessage);
    const relativeTimer = window.setInterval(() => {
      now = Date.now();
    }, 1_000);

    void (async () => {
      unlocked = await isVaultUnlocked();

      if (unlocked) {
        await loadResume();
      } else {
        loading = false;
      }
    })();

    return () => {
      window.clearInterval(relativeTimer);
      window.removeEventListener('message', handleFrameMessage);
    };
  });
</script>

<svelte:head>
  <title>{resume.basics.name || 'Resume'} | ShieldCV</title>
</svelte:head>

{#if !unlocked}
  <VaultUnlockPanel
    busy={unlockBusy}
    copy="Unlock the vault to edit this resume and to import text from PDFs inside the sandboxed parser."
    error={error}
    onUnlock={handleUnlock}
    title="Unlock to edit this resume"
  />
{:else if loading}
  <section class="content-card">
    <p>Loading resume…</p>
  </section>
{:else if error}
  <section class="content-card">
    <p class="section-kicker">Resume Vault</p>
    <h3>Resume missing</h3>
    <p>{error}</p>
    <a class="shell-button shell-button--primary" href="/resumes">Back to resumes</a>
  </section>
{:else}
  <section class="content-card editor-toolbar">
    <div class="section-header">
      <div>
        <p class="section-kicker">Resume Editor</p>
        <h3>{resume.basics.name || 'Untitled resume'}</h3>
      </div>

      <div class="header-actions">
        <button class="shell-button shell-button--primary" data-testid="save-resume" disabled={saving} onclick={handleSave} type="button">
          {#if saving}Saving…{:else}Save now{/if}
        </button>
        <button class="shell-button shell-button--danger" disabled={deleting} onclick={requestDelete} type="button">
          Delete
        </button>
      </div>
    </div>

    <div class="autosave-status" data-testid="autosave-status" aria-live="polite">
      {#if saveStatus === 'saving'}
        <span class="status-dot warning" aria-hidden="true"></span>
        <span>Saving...</span>
      {:else if saveStatus === 'failed'}
        <span class="status-dot danger" aria-hidden="true"></span>
        <span>Save failed</span>
      {:else}
        <span class="status-dot success" aria-hidden="true"></span>
        <span>Saved, {relativeSavedTime()}</span>
      {/if}
    </div>

    {#if saveStatus === 'failed'}
      <div class="save-error-toast" role="alert">
        <p>{saveError}</p>
        <button class="shell-button shell-button--danger" type="button" onclick={persistResume}>
          Retry
        </button>
      </div>
    {/if}
  </section>

  <section class="content-card import-panel">
    <div class="section-header">
      <div>
        <p class="section-kicker">PDF Import</p>
        <h3>Import from an existing resume PDF</h3>
      </div>
      <button class="shell-button" type="button" onclick={() => fileInput?.click()}>
        Choose PDF
      </button>
    </div>

    <div
      class="dropzone"
      data-testid="pdf-dropzone"
      ondragover={(event) => event.preventDefault()}
      ondrop={handleDrop}
      role="button"
      tabindex="0"
    >
      <p>{importBusy ? 'Importing in sandbox…' : 'Drag and drop a PDF here, or tap to upload.'}</p>
      <p class="dropzone-note">
        `pdf.js` runs only inside the sandboxed <code>/pdf-worker</code> iframe, not in the main app.
      </p>
    </div>

    <input
      bind:this={fileInput}
      accept="application/pdf"
      class="sr-only"
      data-testid="pdf-input"
      onchange={(event) => handleFileSelection((event.currentTarget as HTMLInputElement).files)}
      type="file"
    />

    <p class="editor-status" data-testid="pdf-status">{importMessage}</p>

    <iframe
      bind:this={frame}
      class="pdf-import-frame"
      onload={handleFrameLoad}
      sandbox="allow-scripts"
      src="/pdf-worker"
      title="Sandboxed PDF parser"
    ></iframe>
  </section>

  <section class="editor-grid" oninput={scheduleAutosave}>
    <article class="content-card form-section">
      <p class="section-kicker">Basics</p>
      <h3>Identity</h3>

      <div class="form-grid">
        <label class="field">
          <span>Name</span>
          <input bind:value={resume.basics.name} class="field-input" data-testid="input-name" type="text" />
        </label>
        <label class="field">
          <span>Headline</span>
          <input bind:value={resume.basics.label} class="field-input" data-testid="input-label" type="text" />
        </label>
        <label class="field">
          <span>Email</span>
          <input bind:value={resume.basics.email} class="field-input" data-testid="input-email" type="email" />
        </label>
        <label class="field">
          <span>Phone</span>
          <input bind:value={resume.basics.phone} class="field-input" type="text" />
        </label>
        <label class="field">
          <span>Website</span>
          <input bind:value={resume.basics.url} class="field-input" type="url" />
        </label>
        <label class="field">
          <span>City</span>
          <input bind:value={resume.basics.location.city} class="field-input" type="text" />
        </label>
        <label class="field">
          <span>Region</span>
          <input bind:value={resume.basics.location.region} class="field-input" type="text" />
        </label>
        <label class="field">
          <span>Country Code</span>
          <input bind:value={resume.basics.location.countryCode} class="field-input" maxlength="2" type="text" />
        </label>
      </div>

      <label class="field">
        <span>Summary</span>
        <textarea bind:value={resume.basics.summary} class="field-input field-textarea" rows="5"></textarea>
      </label>
    </article>

    <article class="content-card form-section">
      <div class="section-header">
        <div>
          <p class="section-kicker">Work</p>
          <h3>Experience</h3>
        </div>
        <button class="shell-button" type="button" onclick={() => {
          resume.work = [...resume.work, createWork()];
          scheduleAutosave();
        }}>
          Add role
        </button>
      </div>

      <div class="entry-stack">
        {#each resume.work as job, index (job.id)}
          <div class="entry-card">
            <div class="entry-card__header">
              <strong>{job.position || job.name || `Role ${index + 1}`}</strong>
              <button class="shell-button" type="button" onclick={() => {
                resume.work = resume.work.filter(({ id }) => id !== job.id);
                scheduleAutosave();
              }}>
                Remove
              </button>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Company</span>
                <input bind:value={job.name} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Position</span>
                <input bind:value={job.position} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Start</span>
                <input bind:value={job.startDate} class="field-input" placeholder="2022-01" type="text" />
              </label>
              <label class="field">
                <span>End</span>
                <input bind:value={job.endDate} class="field-input" placeholder="Present" type="text" />
              </label>
            </div>

            <label class="field">
              <span>Summary</span>
              <textarea bind:value={job.summary} class="field-input field-textarea" rows="4"></textarea>
            </label>

            <label class="field">
              <span>Highlights</span>
              <textarea
                class="field-input field-textarea"
                oninput={(event) => (job.highlights = linesToArray((event.currentTarget as HTMLTextAreaElement).value))}
                rows="4"
              >{arrayToLines(job.highlights)}</textarea>
            </label>
          </div>
        {/each}
      </div>
    </article>

    <article class="content-card form-section">
      <div class="section-header">
        <div>
          <p class="section-kicker">Education</p>
          <h3>Learning</h3>
        </div>
        <button class="shell-button" type="button" onclick={() => {
          resume.education = [...resume.education, createEducation()];
          scheduleAutosave();
        }}>
          Add education
        </button>
      </div>

      <div class="entry-stack">
        {#each resume.education as school, index (school.id)}
          <div class="entry-card">
            <div class="entry-card__header">
              <strong>{school.institution || `Education ${index + 1}`}</strong>
              <button class="shell-button" type="button" onclick={() => {
                resume.education = resume.education.filter(({ id }) => id !== school.id);
                scheduleAutosave();
              }}>
                Remove
              </button>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Institution</span>
                <input bind:value={school.institution} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Area</span>
                <input bind:value={school.area} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Study Type</span>
                <input bind:value={school.studyType} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Dates</span>
                <input bind:value={school.startDate} class="field-input" placeholder="Start date" type="text" />
              </label>
            </div>
          </div>
        {/each}
      </div>
    </article>

    <article class="content-card form-section">
      <div class="section-header">
        <div>
          <p class="section-kicker">Skills</p>
          <h3>Capabilities</h3>
        </div>
        <button class="shell-button" type="button" onclick={() => {
          resume.skills = [...resume.skills, createSkill()];
          scheduleAutosave();
        }}>
          Add skill
        </button>
      </div>

      <div class="entry-stack">
        {#each resume.skills as skill, index (skill.id)}
          <div class="entry-card">
            <div class="entry-card__header">
              <strong>{skill.name || `Skill ${index + 1}`}</strong>
              <button class="shell-button" type="button" onclick={() => {
                resume.skills = resume.skills.filter(({ id }) => id !== skill.id);
                scheduleAutosave();
              }}>
                Remove
              </button>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Name</span>
                <input bind:value={skill.name} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Level</span>
                <input bind:value={skill.level} class="field-input" type="text" />
              </label>
            </div>

            <label class="field">
              <span>Keywords</span>
              <input
                class="field-input"
                oninput={(event) => (skill.keywords = csvToArray((event.currentTarget as HTMLInputElement).value))}
                type="text"
                value={arrayToCsv(skill.keywords)}
              />
            </label>
          </div>
        {/each}
      </div>
    </article>

    <article class="content-card form-section">
      <div class="section-header">
        <div>
          <p class="section-kicker">Projects</p>
          <h3>Selected work</h3>
        </div>
        <button class="shell-button" type="button" onclick={() => {
          resume.projects = [...resume.projects, createProject()];
          scheduleAutosave();
        }}>
          Add project
        </button>
      </div>

      <div class="entry-stack">
        {#each resume.projects as project, index (project.id)}
          <div class="entry-card">
            <div class="entry-card__header">
              <strong>{project.name || `Project ${index + 1}`}</strong>
              <button class="shell-button" type="button" onclick={() => {
                resume.projects = resume.projects.filter(({ id }) => id !== project.id);
                scheduleAutosave();
              }}>
                Remove
              </button>
            </div>

            <label class="field">
              <span>Name</span>
              <input bind:value={project.name} class="field-input" type="text" />
            </label>

            <label class="field">
              <span>Description</span>
              <textarea bind:value={project.description} class="field-input field-textarea" rows="4"></textarea>
            </label>

            <label class="field">
              <span>Keywords</span>
              <input
                class="field-input"
                oninput={(event) => (project.keywords = csvToArray((event.currentTarget as HTMLInputElement).value))}
                type="text"
                value={arrayToCsv(project.keywords)}
              />
            </label>
          </div>
        {/each}
      </div>
    </article>

    <article class="content-card form-section">
      <div class="section-header">
        <div>
          <p class="section-kicker">Certifications</p>
          <h3>Credentials</h3>
        </div>
        <button class="shell-button" type="button" onclick={() => {
          resume.certifications = [...resume.certifications, createCertification()];
          scheduleAutosave();
        }}>
          Add certification
        </button>
      </div>

      <div class="entry-stack">
        {#each resume.certifications as certification, index (certification.id)}
          <div class="entry-card">
            <div class="entry-card__header">
              <strong>{certification.name || `Certification ${index + 1}`}</strong>
              <button class="shell-button" type="button" onclick={() => {
                resume.certifications = resume.certifications.filter(({ id }) => id !== certification.id);
                scheduleAutosave();
              }}>
                Remove
              </button>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Name</span>
                <input bind:value={certification.name} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Issuer</span>
                <input bind:value={certification.issuer} class="field-input" type="text" />
              </label>
              <label class="field">
                <span>Date</span>
                <input bind:value={certification.date} class="field-input" type="text" />
              </label>
            </div>
          </div>
        {/each}
      </div>
    </article>
  </section>

  <ConfirmDialog
    bind:this={deleteDialog}
    title="Delete this resume?"
    body="This will permanently remove the resume from your encrypted vault. There is no undo."
    busy={deleting}
    onConfirm={confirmDelete}
  />
{/if}
