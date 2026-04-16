<script lang="ts">
  import { onMount } from 'svelte';
  import {
    AlertTriangle,
    BookOpen,
    CalendarDays,
    ClipboardCopy,
    Globe,
    Hash,
    Info,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
    UserRound,
  } from 'lucide-svelte';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import { isVaultUnlocked, listResumes, unlockVault } from '$lib/resume-vault';
  import type { ResumeDocument } from '@shieldcv/resume';

  type AiModule = typeof import('@shieldcv/ai');
  type ComplianceModule = typeof import('@shieldcv/compliance');
  type Finding = import('@shieldcv/compliance').PhiFinding;
  type ScanResult = import('@shieldcv/compliance').ScanResult;
  type ProgressEvent = import('@shieldcv/ai').ProgressEvent;

  type ScanMode = 'resume' | 'demo';
  type FieldText = { field: string; text: string };

  let ai: AiModule | null = null;
  let compliance: ComplianceModule | null = null;

  let mode: ScanMode = 'demo';
  let loadingModels = true;
  let modelsReady = false;
  let loadingResumes = true;
  let scanBusy = false;
  let unlockBusy = false;
  let unlocked = false;
  let error = '';
  let copyStatus = '';
  let selectedResumeId = '';
  let resumes: ResumeDocument[] = [];
  let findings: Finding[] = [];
  let scanSummary: ScanResult | null = null;
  let scannedResume: ResumeDocument | null = null;
  let scannedLabel = '';
  let referenceDialog: HTMLDialogElement | null = null;
  let progress = 0;
  let loaded = 0;
  let total = 0;
  let scanTotalFields = 0;
  let scanProgressFields = 0;
  let referenceItems: Array<{ id: string; title: string; description: string; citation: string }> = [];
  let selectedResume: ResumeDocument | null = null;
  let fieldTextMap = new Map<string, string>();
  let groupedFindings: Array<{ field: string; items: Finding[] }> = [];
  let severityCounts = { high: 0, medium: 0, low: 0 };

  function formatMegabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatFieldLabel(field: string): string {
    const match = /^(basics|work|education|projects|certifications)(?:\[(\d+)\])?\.(summary|highlights|description|area|courses|name|issuer)(?:\[(\d+)\])?$/.exec(
      field,
    );

    if (!match) {
      return field;
    }

    const labelMap = {
      basics: 'Professional summary',
      work: 'Clinical experience',
      education: 'Education',
      projects: 'Projects',
      certifications: 'Certifications',
    } as const;
    const [, section, sectionIndex, property, propertyIndex] = match;
    const label = labelMap[section as keyof typeof labelMap];
    const itemSuffix = typeof sectionIndex === 'string' ? ` ${Number(sectionIndex) + 1}` : '';
    const propertyLabel = property === 'highlights' ? 'highlight' : property === 'courses' ? 'course' : property;
    const propertySuffix = typeof propertyIndex === 'string' ? ` ${Number(propertyIndex) + 1}` : '';

    return `${label}${itemSuffix} ${propertyLabel}${propertySuffix}`.trim();
  }

  function getIdentifierInfo(identifier: Finding['identifier']) {
    if (compliance) {
      return compliance.getIdentifierInfo(identifier);
    }

    return {
      title: identifier,
      description: '',
      examples: [],
      citation: '',
    };
  }

  function collectNarrativeFields(resume: ResumeDocument): FieldText[] {
    const fields: FieldText[] = [];

    if (resume.basics.summary.trim()) {
      fields.push({ field: 'basics.summary', text: resume.basics.summary });
    }

    resume.work.forEach((workItem, index) => {
      if (workItem.summary.trim()) {
        fields.push({ field: `work[${index}].summary`, text: workItem.summary });
      }

      workItem.highlights.forEach((highlight, highlightIndex) => {
        if (highlight.trim()) {
          fields.push({ field: `work[${index}].highlights[${highlightIndex}]`, text: highlight });
        }
      });
    });

    resume.education.forEach((educationItem, index) => {
      if (educationItem.area.trim()) {
        fields.push({ field: `education[${index}].area`, text: educationItem.area });
      }

      educationItem.courses.forEach((course, courseIndex) => {
        if (course.trim()) {
          fields.push({ field: `education[${index}].courses[${courseIndex}]`, text: course });
        }
      });
    });

    resume.projects.forEach((project, index) => {
      if (project.description.trim()) {
        fields.push({ field: `projects[${index}].description`, text: project.description });
      }

      project.highlights.forEach((highlight, highlightIndex) => {
        if (highlight.trim()) {
          fields.push({ field: `projects[${index}].highlights[${highlightIndex}]`, text: highlight });
        }
      });
    });

    resume.certifications.forEach((certification, index) => {
      if (certification.name.trim()) {
        fields.push({ field: `certifications[${index}].name`, text: certification.name });
      }

      if (certification.issuer.trim()) {
        fields.push({ field: `certifications[${index}].issuer`, text: certification.issuer });
      }
    });

    return fields;
  }

  function getFieldTextMap(resume: ResumeDocument | null): Map<string, string> {
    return new Map((resume ? collectNarrativeFields(resume) : []).map((entry) => [entry.field, entry.text]));
  }

  function buildContext(text: string, start: number, end: number): { before: string; match: string; after: string } {
    const before = text.slice(Math.max(0, start - 50), start);
    const match = text.slice(start, end);
    const after = text.slice(end, Math.min(text.length, end + 50));

    return { before, match, after };
  }

  function counts(findingsList: Finding[]): { high: number; medium: number; low: number } {
    return findingsList.reduce(
      (summary, finding) => {
        summary[finding.severity] += 1;
        return summary;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }

  function iconFor(identifier: Finding['identifier']) {
    switch (identifier) {
      case 'name':
        return UserRound;
      case 'geographic':
        return MapPin;
      case 'date':
        return CalendarDays;
      case 'email':
        return Mail;
      case 'phone':
      case 'fax':
        return Phone;
      case 'url':
      case 'ip_address':
        return Globe;
      default:
        return Hash;
    }
  }

  function severityLabel(severity: Finding['severity']): string {
    return `${severity.charAt(0).toUpperCase()}${severity.slice(1)} risk`;
  }

  function findingKey(finding: Finding): string {
    return `${finding.field}-${finding.identifier}-${finding.start}-${finding.end}`;
  }

  function handleProgress(event: ProgressEvent) {
    if (typeof event.progress === 'number') {
      progress = Math.max(progress, event.progress);
    }

    if (typeof event.loaded === 'number') {
      loaded = event.loaded;
    }

    if (typeof event.total === 'number') {
      total = event.total;
    }

    if (event.status === 'error') {
      error = event.error ?? 'AI model loading failed.';
    }
  }

  async function ensureModulesLoaded() {
    if (!ai || !compliance) {
      const [aiModule, complianceModule] = await Promise.all([import('@shieldcv/ai'), import('@shieldcv/compliance')]);
      ai = aiModule;
      compliance = complianceModule;
      referenceItems = compliance.getAllIdentifiers();
    }

    if (!ai.isReady()) {
      await ai.preloadModels(handleProgress);
    }

    modelsReady = true;
    loadingModels = false;
    progress = 1;
  }

  async function refreshResumes() {
    loadingResumes = true;

    try {
      resumes = await listResumes();
      if (!selectedResumeId && resumes[0]) {
        selectedResumeId = resumes[0].id;
      }
      unlocked = true;
      error = '';
    } finally {
      loadingResumes = false;
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

  async function runScan(resume: ResumeDocument, label: string) {
    if (!compliance) {
      return;
    }

    error = '';
    copyStatus = '';
    scanBusy = true;
    findings = [];
    scanSummary = null;
    scannedResume = resume;
    scannedLabel = label;
    scanTotalFields = Math.max(collectNarrativeFields(resume).length, 1);
    scanProgressFields = 0;

    const interval = window.setInterval(() => {
      if (scanProgressFields < scanTotalFields - 1) {
        scanProgressFields += 1;
      }
    }, 180);

    try {
      const nextFindings = await compliance.scanForPhi(resume, { minScore: 0.5 });
      findings = nextFindings;
      scanSummary = compliance.summarizeScan(resume.id, nextFindings);
      scanProgressFields = scanTotalFields;
    } catch (scanError) {
      error = scanError instanceof Error ? scanError.message : 'Unable to scan the resume for PHI.';
    } finally {
      window.clearInterval(interval);
      scanBusy = false;
    }
  }

  async function scanSelectedResume() {
    const resume = resumes.find((candidate) => candidate.id === selectedResumeId);

    if (!resume) {
      error = 'Choose a resume before starting the scan.';
      return;
    }

    await runScan(resume, resume.basics.name || 'Untitled resume');
  }

  async function scanDemo() {
    if (!compliance) {
      return;
    }

    mode = 'demo';
    await runScan(compliance.problematicResume, 'Problematic demo resume');
  }

  async function copySuggestion(finding: Finding) {
    try {
      await navigator.clipboard.writeText(finding.suggestion);
      copyStatus = `Copied suggestion for ${formatFieldLabel(finding.field)}.`;
    } catch {
      copyStatus = 'Clipboard access was unavailable. Copy the suggestion manually.';
    }
  }

  function openReference() {
    referenceDialog?.showModal();
  }

  function closeReference() {
    referenceDialog?.close();
  }

  onMount(async () => {
    try {
      await ensureModulesLoaded();
      unlocked = await isVaultUnlocked();

      if (unlocked) {
        await refreshResumes();
      } else {
        loadingResumes = false;
      }
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : 'Unable to initialize the HIPAA scanner.';
      loadingModels = false;
      loadingResumes = false;
    }
  });

  $: selectedResume = resumes.find((resume) => resume.id === selectedResumeId) ?? null;
  $: fieldTextMap = getFieldTextMap(scannedResume);
  $: groupedFindings = findings.reduce<Array<{ field: string; items: Finding[] }>>((groups, finding) => {
    const existing = groups.find((group) => group.field === finding.field);

    if (existing) {
      existing.items.push(finding);
      return groups;
    }

    groups.push({ field: finding.field, items: [finding] });
    return groups;
  }, []);
  $: severityCounts = counts(findings);
</script>

<svelte:head>
  <title>HIPAA PHI Scanner | ShieldCV</title>
</svelte:head>

<section class="scan-shell">
  <div class="scan-primary">
    <section class="content-card phi-hero">
      <div class="section-header">
        <div>
          <p class="section-kicker">HIPAA Scanner</p>
          <h3>Check clinical resume content before you submit it</h3>
        </div>

        <div class="phi-hero__actions">
          {#if modelsReady}
            <span class="scan-status" data-testid="models-ready">Models ready</span>
          {/if}
          <button class="shell-button shell-button--mobile" type="button" on:click={openReference}>
            <BookOpen size={16} />
            <span>Reference</span>
          </button>
        </div>
      </div>

      <p>
        ShieldCV scans resume narrative fields on this device for potential HIPAA Safe Harbor identifiers,
        then suggests more compliant wording you can review before editing your resume.
      </p>

      <div class="mode-toggle" role="tablist" aria-label="Scanner mode">
        <button
          class:active={mode === 'demo'}
          class="mode-toggle__button"
          type="button"
          on:click={() => {
            mode = 'demo';
            error = '';
          }}
        >
          Try the demo
        </button>
        <button
          class:active={mode === 'resume'}
          class="mode-toggle__button"
          type="button"
          on:click={() => {
            mode = 'resume';
            error = '';
          }}
        >
          Scan my resume
        </button>
      </div>

      {#if loadingModels}
        <div class="scan-progress" data-testid="ai-loading">
          <div class="scan-progress__copy">
            <span>Loading AI models{total ? ` (${formatMegabytes(total)})` : ''}...</span>
            {#if loaded && total}
              <span>{formatMegabytes(loaded)} of {formatMegabytes(total)}</span>
            {/if}
          </div>
          <progress aria-label="AI model loading progress" max="1" value={progress}></progress>
        </div>
      {/if}

      {#if mode === 'demo'}
        <div class="phi-panel">
          <div>
            <strong>Judges’ demo path</strong>
            <p>
              Load a fictional resume with intentional PHI mistakes to see the full scanner flow without
              touching vault data.
            </p>
          </div>
          <button
            class="shell-button shell-button--primary"
            data-testid="scan-demo"
            type="button"
            disabled={!modelsReady || scanBusy}
            on:click={scanDemo}
          >
            {scanBusy ? 'Scanning demo…' : 'Try the demo'}
          </button>
        </div>
      {:else if !unlocked}
        <VaultUnlockPanel
          busy={unlockBusy}
          copy="Unlock your on-device vault to scan stored resumes for PHI without sending any content off-device."
          error={error}
          onUnlock={handleUnlock}
          title="Unlock your resumes"
        />
      {:else}
        <div class="phi-panel">
          <label class="field">
            <span>Choose a resume</span>
            <select class="field-input" bind:value={selectedResumeId} disabled={loadingResumes || scanBusy}>
              {#if resumes.length === 0}
                <option value="">No resumes available</option>
              {:else}
                {#each resumes as resume}
                  <option value={resume.id}>{resume.basics.name || 'Untitled resume'}</option>
                {/each}
              {/if}
            </select>
          </label>

          <button
            class="shell-button shell-button--primary"
            data-testid="scan-resume"
            type="button"
            disabled={!modelsReady || scanBusy || !selectedResume}
            on:click={scanSelectedResume}
          >
            {scanBusy ? 'Scanning resume…' : 'Scan my resume'}
          </button>
        </div>
      {/if}

      {#if scanBusy}
        <div class="scan-progress">
          <div class="scan-progress__copy">
            <span>Scanning resume for potential PHI...</span>
            <span>{scanProgressFields} of {scanTotalFields} narrative fields reviewed</span>
          </div>
          <progress aria-label="PHI scanning progress" max={scanTotalFields || 1} value={scanProgressFields}></progress>
        </div>
      {/if}

      {#if copyStatus}
        <p class="phi-copy-status">{copyStatus}</p>
      {/if}

      {#if error && (mode === 'demo' || unlocked || !unlockBusy)}
        <p class="field-error" data-testid="scan-error">{error}</p>
      {/if}
    </section>

    {#if scanSummary}
      <section class="content-card phi-summary" data-testid="phi-summary">
        <div class="phi-summary__header">
          <div>
            <p class="section-kicker">Scan Summary</p>
            <h3>{scanSummary.findingsCount} potential PHI findings in {scannedLabel}</h3>
          </div>
          <div class="phi-summary__badges">
            <span class="severity-pill severity-pill--high">{severityCounts.high} high</span>
            <span class="severity-pill severity-pill--medium">{severityCounts.medium} medium</span>
            <span class="severity-pill severity-pill--low">{severityCounts.low} low</span>
          </div>
        </div>
      </section>
    {/if}

    {#if scanSummary && findings.length === 0}
      <section class="content-card empty-state">
        <div class="empty-state__icon">
          <ShieldCheck size={22} />
        </div>
        <div>
          <p class="section-kicker">No Findings</p>
          <h3>No potential PHI detected</h3>
          <p>
            Your resume appears compliant with HIPAA Safe Harbor guidelines. Note: this is an automated
            scan and does not replace professional compliance review.
          </p>
        </div>
      </section>
    {/if}

    {#if findings.length > 0}
      <section class="phi-findings">
        {#each groupedFindings as group}
          <section class="content-card phi-group">
            <div class="phi-group__header">
              <div>
                <p class="section-kicker">Resume Field</p>
                <h3>{formatFieldLabel(group.field)}</h3>
              </div>
              <span class="phi-group__count">{group.items.length} finding{group.items.length === 1 ? '' : 's'}</span>
            </div>

            <div class="phi-group__list">
              {#each group.items as finding}
                {@const fieldText = fieldTextMap.get(finding.field) ?? ''}
                {@const context = buildContext(fieldText, finding.start, finding.end)}
                {@const Icon = iconFor(finding.identifier)}
                <details class="finding-card" data-testid="finding-card">
                  <summary class="finding-card__summary">
                    <div class="finding-card__meta">
                      <span class={`severity-pill severity-pill--${finding.severity}`}>{severityLabel(finding.severity)}</span>
                      <span class="identifier-pill" data-testid="finding-identifier">
                        <Icon size={15} />
                        <span>{getIdentifierInfo(finding.identifier).title}</span>
                      </span>
                    </div>

                    <p class="finding-context">
                      <span>{context.before}</span><mark>{context.match}</mark><span>{context.after}</span>
                    </p>
                  </summary>

                  <div class="finding-card__body">
                    <p>{finding.explanation}</p>

                    <div class="suggestion-box">
                      <p class="suggestion-box__label">Suggested compliant alternative</p>
                      <p>{finding.suggestion}</p>
                    </div>

                    <div class="finding-card__actions">
                      <button
                        class="shell-button shell-button--primary"
                        data-testid={`copy-suggestion-${findingKey(finding)}`}
                        type="button"
                        on:click={() => copySuggestion(finding)}
                      >
                        <ClipboardCopy size={16} />
                        <span>Apply suggestion</span>
                      </button>
                    </div>

                    <details class="learn-more">
                      <summary>
                        <Info size={15} />
                        <span>Learn more</span>
                      </summary>
                      <p>{finding.citation}</p>
                      <p>
                        HIPAA Safe Harbor requires removing this kind of identifier or replacing it with a
                        generalized description before a clinical story can be treated as de-identified.
                      </p>
                    </details>
                  </div>
                </details>
              {/each}
            </div>
          </section>
        {/each}
      </section>
    {/if}
  </div>

  <aside class="content-card phi-reference">
    <div class="section-header">
      <div>
        <p class="section-kicker">Reference</p>
        <h3>The 18 HIPAA identifiers</h3>
      </div>
      <BookOpen size={18} />
    </div>

    <p>
      HIPAA’s Safe Harbor method requires removing these 18 types of identifiers from protected health
      information before it can be considered de-identified.
    </p>

    <div class="reference-list">
      {#each referenceItems as item}
        <article class="reference-item">
          <strong>{item.title}</strong>
          <p>{item.description}</p>
          <span>{item.citation}</span>
        </article>
      {/each}
    </div>

    <a class="shell-button" href="/security">View ShieldCV security posture</a>
  </aside>
</section>

<dialog bind:this={referenceDialog} class="posture-dialog phi-reference-dialog">
  <div class="dialog-header">
    <div>
      <p class="section-kicker">Reference</p>
      <h4>The 18 HIPAA identifiers</h4>
    </div>
    <button class="dialog-close" type="button" aria-label="Close reference" on:click={closeReference}>×</button>
  </div>
  <div class="dialog-body">
    <p>
      HIPAA’s Safe Harbor method requires removing these 18 types of identifiers from protected health
      information before it can be considered de-identified.
    </p>
    <div class="reference-list">
      {#each referenceItems as item}
        <article class="reference-item">
          <strong>{item.title}</strong>
          <p>{item.description}</p>
          <span>{item.citation}</span>
        </article>
      {/each}
    </div>
    <a class="shell-button" href="/security" on:click={closeReference}>View ShieldCV security posture</a>
  </div>
</dialog>

<style>
  .scan-shell {
    display: grid;
    gap: 1rem;
    max-width: 72rem;
  }

  .scan-primary,
  .phi-findings {
    display: grid;
    gap: 1rem;
  }

  .phi-hero,
  .phi-summary,
  .phi-group,
  .phi-reference {
    display: grid;
    gap: 1rem;
  }

  .phi-hero__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .mode-toggle {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    padding: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--bg-muted);
  }

  .mode-toggle__button {
    min-height: 2.75rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid transparent;
    border-radius: 0.85rem;
    background: transparent;
    color: var(--text-soft);
    font-weight: 700;
  }

  .mode-toggle__button.active {
    border-color: color-mix(in srgb, var(--accent) 26%, transparent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--text);
  }

  .phi-panel {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--bg-muted);
  }

  .phi-panel p,
  .phi-copy-status,
  .phi-group__count,
  .reference-item p,
  .reference-item span {
    margin: 0;
    color: var(--text-muted);
  }

  .phi-summary__header,
  .phi-group__header,
  .finding-card__meta,
  .finding-card__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .phi-summary__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .severity-pill,
  .identifier-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .severity-pill--high {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  }

  .severity-pill--medium {
    background: color-mix(in srgb, var(--warning) 16%, transparent);
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  }

  .severity-pill--low {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .identifier-pill {
    border: 1px solid var(--border);
    color: var(--text-soft);
    background: var(--surface-strong);
  }

  .empty-state__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--success) 16%, transparent);
    color: var(--success);
  }

  .phi-group__list {
    display: grid;
    gap: 0.85rem;
  }

  .finding-card {
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--bg-muted);
    overflow: hidden;
  }

  .finding-card[open] {
    border-color: var(--border-strong);
  }

  .finding-card__summary {
    display: grid;
    gap: 0.85rem;
    padding: 1rem;
    list-style: none;
    cursor: pointer;
  }

  .finding-card__summary::-webkit-details-marker {
    display: none;
  }

  .finding-card__body {
    display: grid;
    gap: 1rem;
    padding: 0 1rem 1rem;
  }

  .finding-context {
    margin: 0;
    color: var(--text-soft);
    line-height: 1.7;
    word-break: break-word;
  }

  .finding-context mark {
    padding: 0.12rem 0.3rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--warning) 26%, transparent);
    color: var(--text);
  }

  .suggestion-box {
    display: grid;
    gap: 0.45rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-muted));
  }

  .suggestion-box p,
  .learn-more p {
    margin: 0;
  }

  .suggestion-box__label {
    color: var(--accent);
    font-size: 0.84rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .learn-more {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }

  .learn-more summary {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }

  .reference-list {
    display: grid;
    gap: 0.75rem;
  }

  .reference-item {
    display: grid;
    gap: 0.35rem;
    padding: 0.9rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--bg-muted);
  }

  .reference-item strong {
    color: var(--text);
  }

  .phi-reference {
    display: none;
  }

  .phi-reference-dialog .dialog-body {
    gap: 1rem;
  }

  .shell-button--mobile {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  @media (min-width: 64rem) {
    .scan-shell {
      grid-template-columns: minmax(0, 1fr) 20rem;
      align-items: start;
    }

    .phi-reference {
      position: sticky;
      top: 2rem;
      display: grid;
    }

    .shell-button--mobile,
    .phi-reference-dialog {
      display: none;
    }
  }
</style>
