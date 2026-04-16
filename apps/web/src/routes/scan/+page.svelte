<script lang="ts">
  import { onMount } from 'svelte';
  import { appendEntry } from '@shieldcv/audit';
  import {
    AlertTriangle,
    BookOpen,
    Briefcase,
    CalendarDays,
    CheckCheck,
    ClipboardCopy,
    Globe,
    Hash,
    Info,
    LockKeyhole,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
    UserRound,
  } from 'lucide-svelte';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import {
    deleteGdprApplication,
    isVaultUnlocked,
    listGdprApplications,
    listResumes,
    saveGdprApplication,
    unlockVault,
  } from '$lib/resume-vault';
  import type { ResumeDocument } from '@shieldcv/resume';
  import type {
    ApplicationRecord,
    CmmcEducationContent,
    CmmcFinding,
    GdprEducationContent,
    PhiFinding,
    ScanResult,
  } from '@shieldcv/compliance';

  type AiModule = typeof import('@shieldcv/ai');
  type ComplianceModule = typeof import('@shieldcv/compliance');
  type ProgressEvent = import('@shieldcv/ai').ProgressEvent;

  type ScanMode = 'resume' | 'demo';
  type ComplianceTab = 'hipaa' | 'cmmc' | 'gdpr';
  type FieldText = { field: string; text: string };
  type HipaaGroupedFindings = Array<{ field: string; items: PhiFinding[] }>;
  type CmmcGroupedFindings = Array<{ field: string; items: CmmcFinding[] }>;
  type DeadlineTone = 'green' | 'yellow' | 'red' | 'gray';

  let ai: AiModule | null = null;
  let compliance: ComplianceModule | null = null;

  let activeTab: ComplianceTab = 'hipaa';
  let mode: ScanMode = 'demo';
  let loadingModels = true;
  let modelsReady = false;
  let loadingResumes = true;
  let scanBusy = false;
  let cmmcBusy = false;
  let unlockBusy = false;
  let unlocked = false;
  let error = '';
  let copyStatus = '';
  let selectedResumeId = '';
  let resumes: ResumeDocument[] = [];
  let hipaaFindings: PhiFinding[] = [];
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
  let groupedFindings: HipaaGroupedFindings = [];
  let severityCounts = { high: 0, medium: 0, low: 0 };

  let cmmcFindings: CmmcFinding[] = [];
  let cmmcEducation: CmmcEducationContent | null = null;
  let cmmcGroupedFindings: CmmcGroupedFindings = [];
  let cmmcCounts = { high: 0, medium: 0, low: 0 };
  let cmmcScannedLabel = '';

  let gdprEducation: GdprEducationContent | null = null;
  let applications: ApplicationRecord[] = [];
  let platformOptions: string[] = [];
  let gdprPlatform = 'LinkedIn';
  let gdprCompany = '';
  let gdprDateApplied = new Date().toISOString().slice(0, 10);

  function auditWarn(context: string, auditError: unknown) {
    console.warn(`Audit log write failed after ${context}.`, auditError);
  }

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

  function getIdentifierInfo(identifier: PhiFinding['identifier']) {
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

  function counts<T extends { severity: 'high' | 'medium' | 'low' }>(
    findingsList: T[],
  ): { high: number; medium: number; low: number } {
    return findingsList.reduce(
      (summary, finding) => {
        summary[finding.severity] += 1;
        return summary;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }

  function iconFor(identifier: PhiFinding['identifier']) {
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

  function iconForCmmc(category: CmmcFinding['category']) {
    switch (category) {
      case 'cui_marking':
        return AlertTriangle;
      case 'itar_ear':
        return Globe;
      case 'program_name':
        return Briefcase;
      case 'technical_data':
        return LockKeyhole;
      case 'clearance_level':
        return ShieldCheck;
      case 'facility_detail':
        return MapPin;
    }
  }

  function severityLabel(severity: 'high' | 'medium' | 'low'): string {
    return `${severity.charAt(0).toUpperCase()}${severity.slice(1)} risk`;
  }

  function findingKey(finding: Pick<PhiFinding, 'field' | 'start' | 'end'> & { identifier?: string; category?: string }): string {
    return `${finding.field}-${finding.identifier ?? finding.category ?? 'item'}-${finding.start}-${finding.end}`;
  }

  function categoryLabel(category: CmmcFinding['category']): string {
    return category.replaceAll('_', ' ');
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
      cmmcEducation = compliance.getCmmcEducation();
      gdprEducation = compliance.getGdprEducation();
      platformOptions = gdprEducation.commonPlatforms.map((platform) => platform.name);
      gdprPlatform = platformOptions[0] ?? 'LinkedIn';
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
      applications = await listGdprApplications();

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
    hipaaFindings = [];
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
      hipaaFindings = nextFindings;
      scanSummary = compliance.summarizeScan(resume.id, nextFindings);
      scanProgressFields = scanTotalFields;
      void appendEntry(
        'scan_completed',
        `Completed scan for resume ${scanSummary.resumeId} with ${scanSummary.findingsCount} finding${scanSummary.findingsCount === 1 ? '' : 's'}.`,
      ).catch((auditError) => {
        auditWarn('scan completion', auditError);
      });

      if (scanSummary.findingsCount > 0) {
        void appendEntry(
          'scan_phi_detected',
          `Found ${scanSummary.findingsCount} potential PHI items in resume ${scanSummary.resumeId}`,
        ).catch((auditError) => {
          auditWarn('PHI detection', auditError);
        });
      }
    } catch (scanError) {
      error = scanError instanceof Error ? scanError.message : 'Unable to scan the resume for PHI.';
    } finally {
      window.clearInterval(interval);
      scanBusy = false;
    }
  }

  async function runCmmcScan(resume: ResumeDocument, label: string) {
    if (!compliance) {
      return;
    }

    error = '';
    copyStatus = '';
    cmmcBusy = true;
    cmmcFindings = [];
    scannedResume = resume;
    cmmcScannedLabel = label;

    try {
      cmmcFindings = await compliance.scanForCui(resume);
      void appendEntry(
        'scan_completed',
        `Completed CMMC scan for ${resume.id} with ${cmmcFindings.length} finding${cmmcFindings.length === 1 ? '' : 's'}.`,
      ).catch((auditError) => {
        auditWarn('CMMC scan completion', auditError);
      });
    } catch (scanError) {
      error = scanError instanceof Error ? scanError.message : 'Unable to scan the resume for controlled information risks.';
    } finally {
      cmmcBusy = false;
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

  async function scanSelectedResumeForCmmc() {
    const resume = resumes.find((candidate) => candidate.id === selectedResumeId);

    if (!resume) {
      error = 'Choose a resume before starting the CMMC scan.';
      return;
    }

    await runCmmcScan(resume, resume.basics.name || 'Untitled resume');
  }

  async function scanDemo() {
    if (!compliance) {
      return;
    }

    mode = 'demo';
    await runScan(compliance.problematicResume, 'Problematic demo resume');
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      copyStatus = successMessage;
    } catch {
      copyStatus = 'Clipboard access was unavailable. Copy the text manually.';
    }
  }

  async function copySuggestion(finding: PhiFinding) {
    await copyText(finding.suggestion, `Copied suggestion for ${formatFieldLabel(finding.field)}.`);
  }

  function openReference() {
    referenceDialog?.showModal();
  }

  function closeReference() {
    referenceDialog?.close();
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatDateTime(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function deadlineTone(deadline?: string): DeadlineTone {
    if (!deadline) {
      return 'gray';
    }

    const diff = new Date(deadline).getTime() - Date.now();
    const daysRemaining = diff / (1000 * 60 * 60 * 24);

    if (daysRemaining < 0) {
      return 'red';
    }

    if (daysRemaining < 7) {
      return 'yellow';
    }

    return 'green';
  }

  function deadlineLabel(record: ApplicationRecord): string {
    if (!record.dsarDeadline) {
      return 'DSAR not sent';
    }

    const diff = new Date(record.dsarDeadline).getTime() - Date.now();
    const roundedDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (roundedDays < 0) {
      return `Overdue by ${Math.abs(roundedDays)} day${Math.abs(roundedDays) === 1 ? '' : 's'}`;
    }

    return `${roundedDays} day${roundedDays === 1 ? '' : 's'} remaining`;
  }

  function aiActCountdown(): string {
    const effective = new Date('2026-08-02T00:00:00.000Z').getTime();
    const diff = effective - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days} day${days === 1 ? '' : 's'} until it takes effect`;
    }

    if (days === 0) {
      return 'Effective today';
    }

    const elapsed = Math.abs(days);
    return `Effective for ${elapsed} day${elapsed === 1 ? '' : 's'}`;
  }

  function applicationIdentity(): { userName: string; userEmail: string } {
    const resume = selectedResume ?? resumes[0] ?? scannedResume;

    return {
      userName: resume?.basics.name || 'Resume Applicant',
      userEmail: resume?.basics.email || 'candidate@example.com',
    };
  }

  async function addApplication() {
    if (!gdprCompany.trim()) {
      error = 'Enter a company name before saving the application.';
      activeTab = 'gdpr';
      return;
    }

    const record = compliance?.createApplicationRecord(gdprPlatform, gdprCompany);

    if (!record) {
      return;
    }

    const appliedAt = new Date(`${gdprDateApplied}T00:00:00.000Z`).toISOString();
    await saveGdprApplication({
      ...record,
      dateApplied: appliedAt,
    });

    applications = await listGdprApplications();
    gdprCompany = '';
    copyStatus = `Saved ${gdprPlatform} application for ${applications[0]?.company ?? 'company'}.`;
  }

  async function generateGdprEmail(record: ApplicationRecord, kind: 'dsar' | 'erasure') {
    if (!compliance) {
      return;
    }

    const identity = applicationIdentity();
    const template =
      kind === 'dsar'
        ? compliance.generateDsarEmail(record, identity.userName, identity.userEmail)
        : compliance.generateErasureEmail(record, identity.userName, identity.userEmail);

    await copyText(
      `${template.subject}\n\n${template.body}`,
      `${kind === 'dsar' ? 'DSAR' : 'Erasure request'} copied for ${record.company}.`,
    );

    const now = new Date().toISOString();
    const updatedRecord: ApplicationRecord =
      kind === 'dsar'
        ? {
            ...record,
            dsarSent: true,
            dsarSentDate: now,
            dsarDeadline: compliance.calculateDeadline(now),
          }
        : {
            ...record,
            erasureRequested: true,
            erasureDate: now,
          };

    await saveGdprApplication(updatedRecord);
    applications = await listGdprApplications();

    if (kind === 'dsar') {
      void appendEntry('scan_completed', `Generated DSAR for ${record.company} on ${record.platform}`).catch(
        (auditError) => {
          auditWarn('DSAR generation', auditError);
        },
      );
    }
  }

  async function removeApplication(id: string) {
    await deleteGdprApplication(id);
    applications = await listGdprApplications();
    copyStatus = 'Removed application from the encrypted GDPR tracker.';
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
      error = loadError instanceof Error ? loadError.message : 'Unable to initialize the compliance tools.';
      loadingModels = false;
      loadingResumes = false;
    }
  });

  $: selectedResume = resumes.find((resume) => resume.id === selectedResumeId) ?? null;
  $: fieldTextMap = getFieldTextMap(scannedResume);
  $: groupedFindings = hipaaFindings.reduce<HipaaGroupedFindings>((groups, finding) => {
    const existing = groups.find((group) => group.field === finding.field);

    if (existing) {
      existing.items.push(finding);
      return groups;
    }

    groups.push({ field: finding.field, items: [finding] });
    return groups;
  }, []);
  $: severityCounts = counts(hipaaFindings);
  $: cmmcGroupedFindings = cmmcFindings.reduce<CmmcGroupedFindings>((groups, finding) => {
    const existing = groups.find((group) => group.field === finding.field);

    if (existing) {
      existing.items.push(finding);
      return groups;
    }

    groups.push({ field: finding.field, items: [finding] });
    return groups;
  }, []);
  $: cmmcCounts = counts(cmmcFindings);
</script>

<svelte:head>
  <title>Compliance Tools | ShieldCV</title>
</svelte:head>

<section class="scan-shell">
  <div class="scan-primary">
    <section class="content-card compliance-hero">
      <div class="section-header">
        <div>
          <p class="section-kicker">Compliance Workspace</p>
          <h3>Review resume and job-search privacy risks before you apply</h3>
        </div>

        <div class="phi-hero__actions">
          {#if activeTab === 'hipaa' && modelsReady}
            <span class="scan-status" data-testid="models-ready">Models ready</span>
          {/if}
          {#if activeTab === 'hipaa'}
            <button class="shell-button shell-button--mobile" type="button" on:click={openReference}>
              <BookOpen size={16} />
              <span>Reference</span>
            </button>
          {/if}
        </div>
      </div>

      <p>
        ShieldCV now includes three compliance tools: HIPAA for clinical resume review, CMMC for
        defense-sector resume hygiene, and GDPR for tracking access and erasure requests across job
        platforms.
      </p>

      <div class="top-tabs" role="tablist" aria-label="Compliance modules">
        <button
          class:active={activeTab === 'hipaa'}
          class="top-tabs__button"
          data-testid="tab-hipaa"
          type="button"
          on:click={() => {
            activeTab = 'hipaa';
            error = '';
          }}
        >
          HIPAA
        </button>
        <button
          class:active={activeTab === 'cmmc'}
          class="top-tabs__button"
          data-testid="tab-cmmc"
          type="button"
          on:click={() => {
            activeTab = 'cmmc';
            error = '';
          }}
        >
          CMMC
        </button>
        <button
          class:active={activeTab === 'gdpr'}
          class="top-tabs__button"
          data-testid="tab-gdpr"
          type="button"
          on:click={() => {
            activeTab = 'gdpr';
            error = '';
          }}
        >
          GDPR
        </button>
      </div>

      {#if copyStatus}
        <p class="phi-copy-status" role="status">{copyStatus}</p>
      {/if}

      {#if error}
        <p class="field-error" data-testid="scan-error">{error}</p>
      {/if}
    </section>

    {#if activeTab === 'hipaa'}
      <section class="content-card phi-hero">
        <div class="section-header">
          <div>
            <p class="section-kicker">HIPAA Scanner</p>
            <h3>Check clinical resume content before you submit it</h3>
          </div>
        </div>

        <p>
          ShieldCV scans resume narrative fields on this device for potential HIPAA Safe Harbor
          identifiers, then suggests more compliant wording you can review before editing your resume.
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
                Load a fictional resume with intentional PHI mistakes to see the full scanner flow
                without touching vault data.
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
            error=""
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

      {#if scanSummary && hipaaFindings.length === 0}
        <section class="content-card empty-state">
          <div class="empty-state__icon">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p class="section-kicker">No Findings</p>
            <h3>No potential PHI detected</h3>
            <p>
              Your resume appears compliant with HIPAA Safe Harbor guidelines. Note: this is an
              automated scan and does not replace professional compliance review.
            </p>
          </div>
        </section>
      {/if}

      {#if hipaaFindings.length > 0}
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
                          HIPAA Safe Harbor requires removing this kind of identifier or replacing it
                          with a generalized description before a clinical story can be treated as
                          de-identified.
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
    {/if}

    {#if activeTab === 'cmmc'}
      <section class="content-card phi-hero">
        <div class="section-header">
          <div>
            <p class="section-kicker">CMMC Review</p>
            <h3>Flag public resume details that could point to CUI or defense-sensitive work</h3>
          </div>
        </div>

        <p>
          This scanner uses lightweight pattern matching to catch markings, export-control references,
          recognizable defense programs, clearance language, and facility clues that deserve review
          before you share a resume publicly.
        </p>

        {#if !unlocked}
          <VaultUnlockPanel
            busy={unlockBusy}
            copy="Unlock your on-device vault to review stored resumes for CMMC and CUI-related disclosure risks."
            error=""
            onUnlock={handleUnlock}
            title="Unlock your resumes"
          />
        {:else}
          <div class="phi-panel">
            <label class="field">
              <span>Choose a resume</span>
              <select class="field-input" bind:value={selectedResumeId} disabled={loadingResumes || cmmcBusy}>
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
              data-testid="scan-cmmc"
              type="button"
              disabled={cmmcBusy || !selectedResume}
              on:click={scanSelectedResumeForCmmc}
            >
              {cmmcBusy ? 'Scanning resume…' : 'Scan my resume'}
            </button>
          </div>
        {/if}
      </section>

      {#if cmmcScannedLabel}
        <section class="content-card phi-summary" data-testid="cmmc-summary">
          <div class="phi-summary__header">
            <div>
              <p class="section-kicker">CMMC Summary</p>
              <h3>{cmmcFindings.length} review flag{cmmcFindings.length === 1 ? '' : 's'} in {cmmcScannedLabel}</h3>
            </div>
            <div class="phi-summary__badges">
              <span class="severity-pill severity-pill--high">{cmmcCounts.high} high</span>
              <span class="severity-pill severity-pill--medium">{cmmcCounts.medium} medium</span>
              <span class="severity-pill severity-pill--low">{cmmcCounts.low} low</span>
            </div>
          </div>
        </section>
      {/if}

      {#if cmmcScannedLabel && cmmcFindings.length === 0}
        <section class="content-card empty-state">
          <div class="empty-state__icon">
            <CheckCheck size={22} />
          </div>
          <div>
            <p class="section-kicker">Clean Result</p>
            <h3>No common CMMC/CUI disclosure flags detected</h3>
            <p>
              This resume did not match the current defense-oriented keyword set. Keep in mind that
              approval and release rules still depend on your employer, contract, and security office.
            </p>
          </div>
        </section>
      {/if}

      {#if cmmcFindings.length > 0}
        <section class="phi-findings">
          {#each cmmcGroupedFindings as group}
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
                  {@const Icon = iconForCmmc(finding.category)}
                  <details class="finding-card" open>
                    <summary class="finding-card__summary">
                      <div class="finding-card__meta">
                        <span class={`severity-pill severity-pill--${finding.severity}`}>{severityLabel(finding.severity)}</span>
                        <span class="identifier-pill">
                          <Icon size={15} />
                          <span>{categoryLabel(finding.category)}</span>
                        </span>
                      </div>

                      <p class="finding-context">
                        <span>{context.before}</span><mark>{context.match}</mark><span>{context.after}</span>
                      </p>
                    </summary>

                    <div class="finding-card__body">
                      <p>{finding.explanation}</p>

                      <div class="suggestion-box">
                        <p class="suggestion-box__label">Safer resume guidance</p>
                        <p>{finding.guidance}</p>
                      </div>
                    </div>
                  </details>
                {/each}
              </div>
            </section>
          {/each}
        </section>
      {/if}

      {#if cmmcEducation}
        <section class="education-grid">
          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Learn About CMMC</p>
                <h3>CMMC 2.0 in plain language</h3>
              </div>
              <BookOpen size={18} />
            </div>

            {#each cmmcEducation.overview.split('\n\n') as paragraph}
              <p>{paragraph}</p>
            {/each}
          </section>

          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">NIST SP 800-171</p>
                <h3>Control families to know</h3>
              </div>
              <ShieldCheck size={18} />
            </div>

            <div class="reference-list">
              {#each cmmcEducation.nistControls as control}
                <article class="reference-item">
                  <strong>{control.id} · {control.family}</strong>
                  <p>{control.title}</p>
                  <span>{control.relevance}</span>
                </article>
              {/each}
            </div>
          </section>

          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Likely Resume Risks</p>
                <h3>CUI-adjacent categories</h3>
              </div>
              <AlertTriangle size={18} />
            </div>

            <div class="reference-list">
              {#each cmmcEducation.cuiCategories as category}
                <article class="reference-item">
                  <strong>{category.name}</strong>
                  <p>{category.description}</p>
                  <span>{category.resumeRisk}</span>
                </article>
              {/each}
            </div>
          </section>

          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Safe Description Patterns</p>
                <h3>Reference box</h3>
              </div>
              <ClipboardCopy size={18} />
            </div>

            <div class="safe-patterns">
              {#each cmmcEducation.safeDescriptionPatterns as pattern}
                <button class="pattern-chip" type="button" on:click={() => copyText(pattern, 'Copied a safe description pattern.')}>
                  {pattern}
                </button>
              {/each}
            </div>
          </section>
        </section>
      {/if}
    {/if}

    {#if activeTab === 'gdpr'}
      <section class="content-card phi-hero">
        <div class="section-header">
          <div>
            <p class="section-kicker">GDPR Toolkit</p>
            <h3>Track applications and generate privacy request templates</h3>
          </div>
        </div>

        <p>
          Store your job applications in the encrypted vault, generate Article 15 and Article 17 email
          templates, and keep an eye on the 30-day response window for platforms and employers.
        </p>

        {#if !unlocked}
          <VaultUnlockPanel
            busy={unlockBusy}
            copy="Unlock your on-device vault to use the encrypted GDPR application tracker."
            error=""
            onUnlock={handleUnlock}
            title="Unlock your tracker"
          />
        {:else}
          <div class="gdpr-toolbar">
            <label class="field">
              <span>Identity source</span>
              <select class="field-input" bind:value={selectedResumeId}>
                {#if resumes.length === 0}
                  <option value="">No resumes available</option>
                {:else}
                  {#each resumes as resume}
                    <option value={resume.id}>{resume.basics.name || 'Untitled resume'}</option>
                  {/each}
                {/if}
              </select>
            </label>

            <div class="gdpr-note">
              Email templates use the selected resume’s stored name and email when available.
            </div>
          </div>

          <section class="gdpr-grid">
            <section class="content-card gdpr-card">
              <div class="section-header">
                <div>
                  <p class="section-kicker">Add Application</p>
                  <h3>Encrypted tracker</h3>
                </div>
                <Briefcase size={18} />
              </div>

              <div class="gdpr-form">
                <label class="field">
                  <span>Platform</span>
                  <select class="field-input" bind:value={gdprPlatform}>
                    {#each platformOptions as option}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                </label>

                <label class="field">
                  <span>Company name</span>
                  <input class="field-input" bind:value={gdprCompany} placeholder="Acme Robotics" />
                </label>

                <label class="field">
                  <span>Date applied</span>
                  <input class="field-input" bind:value={gdprDateApplied} type="date" />
                </label>

                <button class="shell-button shell-button--primary" data-testid="gdpr-add-application" type="button" on:click={addApplication}>
                  Save application
                </button>
              </div>
            </section>

            <section class="content-card gdpr-card ai-act-panel">
              <div class="section-header">
                <div>
                  <p class="section-kicker">EU AI Act</p>
                  <h3>Hiring systems are high-risk</h3>
                </div>
                <CalendarDays size={18} />
              </div>

              <p>{gdprEducation?.aiActInfo.overview}</p>
              <div class="deadline-pill deadline-pill--yellow">
                <strong>August 2, 2026</strong>
                <span>{aiActCountdown()}</span>
              </div>
              <p>{gdprEducation?.aiActInfo.hiringClassification}</p>
              <p>{gdprEducation?.aiActInfo.rightToExplanation}</p>
            </section>
          </section>

          <section class="content-card gdpr-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Application Tracker</p>
                <h3>Stored in encrypted IndexedDB</h3>
              </div>
              <LockKeyhole size={18} />
            </div>

            {#if applications.length === 0}
              <p>No applications saved yet. Add one above to start tracking DSAR and erasure requests.</p>
            {:else}
              <div class="application-list" data-testid="gdpr-application-list">
                {#each applications as record}
                  <article class="application-card">
                    <div class="application-card__header">
                      <div>
                        <strong>{record.company}</strong>
                        <p>{record.platform} · Applied {formatDate(record.dateApplied)}</p>
                      </div>
                      <span class={`deadline-pill deadline-pill--${deadlineTone(record.dsarDeadline)}`}>
                        {deadlineLabel(record)}
                      </span>
                    </div>

                    <div class="application-card__meta">
                      <span>DSAR: {record.dsarSent ? `sent ${formatDateTime(record.dsarSentDate ?? record.dateApplied)}` : 'not sent'}</span>
                      <span>Erasure: {record.erasureRequested ? `requested ${formatDateTime(record.erasureDate ?? record.dateApplied)}` : 'not requested'}</span>
                    </div>

                    <div class="application-card__actions">
                      <button
                        class="shell-button shell-button--primary"
                        data-testid={`gdpr-dsar-${record.id}`}
                        type="button"
                        on:click={() => generateGdprEmail(record, 'dsar')}
                      >
                        <Mail size={16} />
                        <span>Generate DSAR</span>
                      </button>

                      <button
                        class="shell-button"
                        data-testid={`gdpr-erasure-${record.id}`}
                        type="button"
                        on:click={() => generateGdprEmail(record, 'erasure')}
                      >
                        <ClipboardCopy size={16} />
                        <span>Request Erasure</span>
                      </button>

                      <button class="shell-button shell-button--ghost" type="button" on:click={() => removeApplication(record.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      </section>

      {#if gdprEducation}
        <section class="education-grid">
          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Learn About GDPR</p>
                <h3>Why it matters for applicants</h3>
              </div>
              <BookOpen size={18} />
            </div>

            {#each gdprEducation.overview.split('\n\n') as paragraph}
              <p>{paragraph}</p>
            {/each}
          </section>

          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Articles 13-22</p>
                <h3>Rights job seekers actually use</h3>
              </div>
              <ShieldCheck size={18} />
            </div>

            <div class="reference-list">
              {#each gdprEducation.rights as right}
                <article class="reference-item">
                  <strong>{right.article} · {right.title}</strong>
                  <p>{right.description}</p>
                  <span>{right.applicationToJobSeekers}</span>
                </article>
              {/each}
            </div>
          </section>

          <section class="content-card education-card">
            <div class="section-header">
              <div>
                <p class="section-kicker">Common Platforms</p>
                <h3>Where requests usually start</h3>
              </div>
              <Globe size={18} />
            </div>

            <div class="reference-list">
              {#each gdprEducation.commonPlatforms as platform}
                <article class="reference-item">
                  <strong>{platform.name}</strong>
                  <p><a href={platform.dsarUrl} target="_blank" rel="noreferrer">Request access or deletion</a></p>
                  <p><a href={platform.privacyPolicyUrl} target="_blank" rel="noreferrer">Privacy policy</a></p>
                  <span>{platform.typicalResponseTime}</span>
                </article>
              {/each}
            </div>
          </section>
        </section>
      {/if}
    {/if}
  </div>

  {#if activeTab === 'hipaa'}
    <aside class="content-card phi-reference">
      <div class="section-header">
        <div>
          <p class="section-kicker">Reference</p>
          <h3>The 18 HIPAA identifiers</h3>
        </div>
        <BookOpen size={18} />
      </div>

      <p>
        HIPAA’s Safe Harbor method requires removing these 18 types of identifiers from protected
        health information before it can be considered de-identified.
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
  {/if}
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
  .phi-findings,
  .education-grid {
    display: grid;
    gap: 1rem;
  }

  .scan-primary {
    min-width: 0;
  }

  .compliance-hero,
  .phi-hero,
  .phi-summary,
  .phi-group,
  .phi-reference,
  .education-card,
  .gdpr-card {
    display: grid;
    gap: 1rem;
  }

  .education-grid {
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }

  .phi-hero__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .top-tabs,
  .mode-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .top-tabs__button,
  .mode-toggle__button {
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.85);
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 0.65rem 1rem;
  }

  .top-tabs__button.active,
  .mode-toggle__button.active {
    background: #102542;
    border-color: #102542;
    color: white;
  }

  .phi-panel,
  .gdpr-toolbar,
  .gdpr-form,
  .gdpr-grid,
  .application-card,
  .application-card__header,
  .application-card__meta,
  .application-card__actions,
  .scan-progress,
  .scan-progress__copy,
  .phi-summary__header,
  .phi-summary__badges,
  .phi-group__header,
  .finding-card,
  .finding-card__summary,
  .finding-card__body,
  .finding-card__meta,
  .finding-card__actions,
  .reference-list,
  .safe-patterns {
    display: grid;
    gap: 0.75rem;
  }

  .gdpr-grid {
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  }

  .phi-panel,
  .gdpr-toolbar {
    align-items: end;
  }

  .field {
    display: grid;
    gap: 0.45rem;
  }

  .field-input {
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 0.9rem;
    color: inherit;
    font: inherit;
    min-width: 0;
    padding: 0.8rem 0.95rem;
  }

  .scan-progress progress {
    width: 100%;
  }

  .scan-status,
  .severity-pill,
  .identifier-pill,
  .deadline-pill,
  .phi-group__count,
  .gdpr-note {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    gap: 0.4rem;
    justify-self: start;
    padding: 0.4rem 0.8rem;
  }

  .scan-status,
  .gdpr-note {
    background: rgba(16, 37, 66, 0.08);
    color: #102542;
  }

  .severity-pill--high,
  .deadline-pill--red {
    background: rgba(220, 38, 38, 0.12);
    color: #991b1b;
  }

  .severity-pill--medium,
  .deadline-pill--yellow {
    background: rgba(217, 119, 6, 0.12);
    color: #92400e;
  }

  .severity-pill--low,
  .deadline-pill--green {
    background: rgba(22, 163, 74, 0.12);
    color: #166534;
  }

  .deadline-pill--gray {
    background: rgba(100, 116, 139, 0.12);
    color: #475569;
  }

  .identifier-pill,
  .phi-group__count {
    background: rgba(15, 23, 42, 0.06);
    color: #0f172a;
  }

  .phi-summary__header,
  .phi-group__header,
  .application-card__header {
    align-items: start;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  .finding-card {
    background: rgba(255, 255, 255, 0.74);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 1rem;
    padding: 1rem;
  }

  .finding-card__summary {
    cursor: pointer;
    list-style: none;
  }

  .finding-card__summary::-webkit-details-marker {
    display: none;
  }

  .finding-context {
    line-height: 1.6;
    margin: 0;
    word-break: break-word;
  }

  .finding-context mark {
    background: rgba(250, 204, 21, 0.35);
    border-radius: 0.3rem;
    padding: 0.05rem 0.15rem;
  }

  .suggestion-box {
    background: rgba(16, 37, 66, 0.05);
    border-radius: 1rem;
    display: grid;
    gap: 0.35rem;
    padding: 0.9rem 1rem;
  }

  .suggestion-box__label {
    font-size: 0.82rem;
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
  }

  .learn-more summary {
    align-items: center;
    cursor: pointer;
    display: inline-flex;
    gap: 0.35rem;
  }

  .empty-state {
    align-items: start;
    display: grid;
    gap: 1rem;
    grid-template-columns: auto 1fr;
  }

  .empty-state__icon {
    align-items: center;
    background: rgba(22, 163, 74, 0.12);
    border-radius: 1rem;
    color: #166534;
    display: flex;
    height: 3rem;
    justify-content: center;
    width: 3rem;
  }

  .reference-list {
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  }

  .reference-item {
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 1rem;
    display: grid;
    gap: 0.45rem;
    padding: 0.95rem;
  }

  .reference-item p,
  .reference-item span {
    margin: 0;
  }

  .safe-patterns {
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  .pattern-chip {
    background: rgba(16, 37, 66, 0.06);
    border: 1px solid rgba(16, 37, 66, 0.12);
    border-radius: 1rem;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 0.9rem 1rem;
    text-align: left;
  }

  .application-list {
    display: grid;
    gap: 0.9rem;
  }

  .application-card {
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 1rem;
    padding: 1rem;
  }

  .application-card__meta {
    color: rgba(15, 23, 42, 0.7);
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  .application-card__actions {
    grid-template-columns: repeat(auto-fit, minmax(10rem, max-content));
  }

  .ai-act-panel {
    background:
      radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 35%),
      rgba(255, 255, 255, 0.9);
  }

  .phi-copy-status {
    color: #166534;
    margin: 0;
  }

  .field-error {
    color: #991b1b;
    margin: 0;
  }

  .section-kicker {
    color: rgba(15, 23, 42, 0.65);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin: 0 0 0.25rem;
    text-transform: uppercase;
  }

  .section-header {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: space-between;
  }

  .posture-dialog {
    border: none;
    border-radius: 1.25rem;
    max-width: 52rem;
    padding: 0;
    width: min(52rem, calc(100vw - 2rem));
  }

  .dialog-header,
  .dialog-body {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
  }

  .dialog-close {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.5rem;
    justify-self: end;
  }

  @media (max-width: 960px) {
    .scan-shell {
      grid-template-columns: 1fr;
    }
  }
</style>
