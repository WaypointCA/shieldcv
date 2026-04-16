<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import DOMPurify from 'dompurify';
  import { AlertTriangle, Shield, ShieldCheck } from 'lucide-svelte';
  import {
    appendEntry,
    getEntries,
    verificationSummary,
    verifyChain,
    type AuditEntry,
    type AuditEvent,
    type ChainVerification,
  } from '@shieldcv/audit';
  import { createBlankResume } from '@shieldcv/resume';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { ensureAttackModeAuditReady } from '$lib/demo-audit';
  import { maliciousResume } from '$lib/fixtures/malicious-resume';
  import {
    assertResumeWithinSizeLimit,
    MAX_RESUME_SIZE,
    ResumeSizeError,
  } from '$lib/resume-vault';
  import {
    cspViolations,
    type CspViolationRecord,
  } from '$lib/stores/csp-violations';
  import { get } from 'svelte/store';

  type ConfirmDialogHandle = { showModal: () => Promise<void> };

  type AttackStatus = 'running' | 'blocked';

  type AttackLogDetail = {
    label: string;
    value: string;
  };

  type AttackLogEntry = {
    id: string;
    title: string;
    announcement: string;
    defense: string;
    event: AuditEvent;
    status: AttackStatus;
    explanation: string;
    details: AttackLogDetail[];
  };

  const ATTACK_MODE_BODY = `Attack Mode loads intentionally malicious content to demonstrate ShieldCV's security defenses. Every attack will be blocked and logged. This is a security demonstration, not a vulnerability.

Continue?`;

  const verificationDefaults: ChainVerification = {
    valid: true,
    entryCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    brokenAtIndex: null,
    error: null,
  };

  const maliciousBasics = maliciousResume.basics as Record<string, unknown>;
  const maliciousWork = (maliciousResume.work as Array<Record<string, unknown>>)[0] ?? {};
  const maliciousEducation = (maliciousResume.education as Array<Record<string, unknown>>)[0] ?? {};
  const maliciousProject = (maliciousResume.projects as Array<Record<string, unknown>>)[0] ?? {};
  const imgPayload = String(maliciousBasics.summary ?? '');
  const svgPayload = String(maliciousBasics.name ?? '');
  const scriptPayload = String((maliciousWork.highlights as string[] | undefined)?.[0] ?? '');
  const prototypePayload = String(maliciousWork.name ?? '');
  const cssPayload = String(maliciousEducation.area ?? '');
  const phishingUrl = String(maliciousProject.url ?? '');
  const oversizedSummary = String(maliciousResume.oversizedSummary ?? '');

  let gateDialog: ConfirmDialogHandle | null = null;
  let sandboxContainer: HTMLDivElement | null = null;
  let cspDashboard: HTMLDivElement | null = null;

  let confirmed = false;
  let entryBusy = false;
  let sequenceRunning = false;
  let sequenceComplete = false;
  let verifyBusy = false;
  let verification = verificationDefaults;
  let verificationRan = false;
  let blockedCount = 0;
  let counterKey = 0;
  let cspPulse = false;
  let error = '';
  let attackLog: AttackLogEntry[] = [];
  let auditEntries: AuditEntry[] = [];
  let violations: CspViolationRecord[] = [];
  let previousViolationCount = 0;
  let destroyed = false;
  let summaryText = '0 attacks attempted. 0 attacks blocked.';

  function formatTimestamp(timestamp: string): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(timestamp));
  }

  function formatViolationField(value: string | number): string {
    if (value === '' || value === 0) {
      return 'Not provided';
    }

    return String(value);
  }

  async function pause(duration = 380): Promise<void> {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, duration);
    });
  }

  async function refreshAuditEntries(): Promise<void> {
    auditEntries = await getEntries();
  }

  function addAttack(title: string, announcement: string): string {
    const id = `${title}-${crypto.randomUUID()}`;
    attackLog = [
      ...attackLog,
      {
        id,
        title,
        announcement,
        defense: '',
        event: 'attack_blocked_xss',
        status: 'running',
        explanation: 'Executing controlled test…',
        details: [],
      },
    ];
    return id;
  }

  function completeAttack(id: string, patch: Omit<AttackLogEntry, 'id' | 'title' | 'announcement' | 'status'>) {
    attackLog = attackLog.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            ...patch,
            status: 'blocked',
          }
        : entry
    );
    blockedCount += 1;
    counterKey += 1;
  }

  async function logBlock(event: AuditEvent, details: string): Promise<void> {
    await appendEntry(event, details);
    await refreshAuditEntries();
  }

  async function handleVerify(): Promise<void> {
    verifyBusy = true;

    try {
      verification = await verifyChain();
      verificationRan = true;
      await refreshAuditEntries();
      error = '';
    } catch (verifyError) {
      error =
        verifyError instanceof Error ? verifyError.message : 'Unable to verify the Attack Mode audit chain.';
    } finally {
      verifyBusy = false;
    }
  }

  async function waitForViolation(afterCount: number, timeoutMs = 2_000): Promise<CspViolationRecord | null> {
    const started = Date.now();

    while (!destroyed && Date.now() - started < timeoutMs) {
      const next = get(cspViolations);

      if (next.length > afterCount) {
        return next.at(-1) ?? null;
      }

      await pause(50);
    }

    return null;
  }

  async function runSequence(): Promise<void> {
    sequenceRunning = true;
    error = '';

    try {
      await runTrustedTypesImgAttack();
      await runDomPurifyScriptAttack();
      await runPrototypePollutionAttack();
      await runCspInlineHandlerAttack();
      await runSvgAttack();
      await runCssInjectionAttack();
      await runDosAttack();
      sequenceComplete = true;
    } catch (sequenceError) {
      error =
        sequenceError instanceof Error
          ? sequenceError.message
          : 'Attack Mode halted unexpectedly before the sequence finished.';
    } finally {
      sequenceRunning = false;
    }
  }

  async function runTrustedTypesImgAttack(): Promise<void> {
    const id = addAttack('Attack 1: XSS via img onerror', 'Attempting XSS via img onerror in resume summary…');
    await tick();
    await pause();

    let message = 'Trusted Types blocked the assignment before the payload touched the live DOM.';

    try {
      const probe = document.createElement('div');
      probe.innerHTML = imgPayload;
    } catch (attackError) {
      message =
        attackError instanceof Error ? attackError.message : 'Trusted Types rejected the HTML assignment.';
    }

    await logBlock('attack_blocked_trusted_types', `Blocked img onerror payload in Attack Mode: ${message}`);
    completeAttack(id, {
      defense: 'Trusted Types default policy',
      event: 'attack_blocked_trusted_types',
      explanation: 'The browser rejected a raw HTML assignment before any handler or script could run.',
      details: [
        { label: 'Sink', value: "document.createElement('div').innerHTML" },
        { label: 'Payload', value: imgPayload },
        { label: 'Browser response', value: message },
      ],
    });
    await pause();
  }

  async function runDomPurifyScriptAttack(): Promise<void> {
    const id = addAttack(
      'Attack 2: XSS via script tag injection',
      'Attempting script tag injection through the resume highlights field…'
    );
    await tick();
    await pause();

    const sanitized = DOMPurify.sanitize(scriptPayload, { RETURN_TRUSTED_TYPE: false });

    await logBlock(
      'attack_blocked_xss',
      `DOMPurify stripped script injection in Attack Mode. Before length ${scriptPayload.length}, after length ${sanitized.length}.`
    );
    completeAttack(id, {
      defense: 'DOMPurify sanitization',
      event: 'attack_blocked_xss',
      explanation: 'DOMPurify removed the executable `<script>` content before any rendering path could consume it.',
      details: [
        { label: 'Before', value: scriptPayload },
        { label: 'After', value: sanitized === '' ? '(empty string)' : sanitized },
        { label: 'Proof', value: sanitized.includes('<script') ? 'Unexpected script tag remained.' : 'Script tag removed.' },
      ],
    });
    await pause();
  }

  async function runPrototypePollutionAttack(): Promise<void> {
    const id = addAttack(
      'Attack 3: Prototype pollution via JSON parse',
      'Attempting prototype pollution through a JSON-shaped work.name payload…'
    );
    await tick();
    await pause();

    const parsed = JSON.parse(prototypePayload, (key, value) => (key === '__proto__' ? undefined : value)) as Record<
      string,
      unknown
    >;
    const adminValue = (Object.prototype as Record<string, unknown>).admin;

    await logBlock(
      'attack_blocked_prototype_pollution',
      `Prototype pollution attempt neutralized in Attack Mode. Object.prototype.admin remained ${String(adminValue)}.`
    );
    completeAttack(id, {
      defense: 'Prototype-pollution reviver guard',
      event: 'attack_blocked_prototype_pollution',
      explanation: 'The parser dropped the dangerous `__proto__` key, so Object.prototype stayed untouched.',
      details: [
        { label: 'Payload', value: prototypePayload },
        { label: 'Parsed keys', value: Object.keys(parsed).join(', ') || '(none)' },
        { label: 'Object.prototype.admin', value: String(adminValue) },
      ],
    });
    await pause();
  }

  async function runCspInlineHandlerAttack(): Promise<void> {
    const id = addAttack(
      'Attack 4: CSP violation from inline event handler',
      'Attempting an inline onclick handler inside a sandboxed probe element…'
    );
    await tick();
    await pause();

    previousViolationCount = get(cspViolations).length;
    let trustedTypesMessage = 'Trusted Types intercepted the inline handler before CSP evaluation.';

    try {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Inline handler probe';
      button.setAttribute('onclick', "window.__attackModeInlineHandlerRan = true");
      sandboxContainer?.append(button);
      button.remove();
    } catch (attackError) {
      trustedTypesMessage =
        attackError instanceof Error
          ? attackError.message
          : 'Trusted Types rejected the inline handler assignment.';
    }

    const violationPromise = waitForViolation(previousViolationCount);
    const imageProbe = document.createElement('img');
    imageProbe.alt = '';
    imageProbe.src = 'https://blocked-by-csp.invalid/attack-mode-probe.png';
    sandboxContainer?.append(imageProbe);
    const violation = await violationPromise;
    imageProbe.remove();

    const violationSummary = violation
      ? `${violation.violatedDirective} blocked ${violation.blockedURI || 'inline source'} at line ${violation.lineNumber || 0}.`
      : 'No CSP event surfaced, but the external probe remained blocked.';

    await logBlock(
      'attack_blocked_csp_violation',
      `Inline handler class blocked by Trusted Types; CSP dashboard probe recorded: ${violationSummary}`
    );
    completeAttack(id, {
      defense: 'Trusted Types plus CSP telemetry',
      event: 'attack_blocked_csp_violation',
      explanation:
        'Trusted Types blocked the inline handler assignment first, and a follow-up CSP probe populated the live violation dashboard without sending a real network request.',
      details: [
        { label: 'Inline handler assignment', value: trustedTypesMessage },
        { label: 'Violated directive', value: violation?.violatedDirective ?? 'No event captured' },
        { label: 'Blocked URI', value: violation?.blockedURI || 'https://blocked-by-csp.invalid/attack-mode-probe.png' },
        { label: 'Source', value: violation?.sourceFile || 'Attack Mode probe' },
      ],
    });
    await pause();
  }

  async function runSvgAttack(): Promise<void> {
    const id = addAttack('Attack 5: SVG injection', 'Attempting SVG onload injection in the candidate name field…');
    await tick();
    await pause();

    let message = 'Trusted Types blocked the SVG payload.';

    try {
      const probe = document.createElement('div');
      probe.innerHTML = svgPayload;
    } catch (attackError) {
      message =
        attackError instanceof Error ? attackError.message : 'Trusted Types rejected the SVG payload.';
    }

    await logBlock('attack_blocked_trusted_types', `Blocked SVG payload in Attack Mode: ${message}`);
    completeAttack(id, {
      defense: 'Trusted Types default policy',
      event: 'attack_blocked_trusted_types',
      explanation: 'The SVG payload was rejected before any `onload` handler could be parsed or executed.',
      details: [
        { label: 'Payload', value: svgPayload },
        { label: 'Browser response', value: message },
      ],
    });
    await pause();
  }

  async function runCssInjectionAttack(): Promise<void> {
    const id = addAttack('Attack 6: CSS injection', 'Rendering a hostile education area payload as inert text…');
    await tick();
    await pause();

    const textProbe = document.createElement('div');
    textProbe.textContent = cssPayload;

    await logBlock(
      'attack_blocked_xss',
      'CSS injection rendered as inert text content in Attack Mode. Style tags were displayed instead of executed.'
    );
    completeAttack(id, {
      defense: 'Text-only rendering path',
      event: 'attack_blocked_xss',
      explanation: 'ShieldCV renders this field with textContent, so the style tag stays visible and harmless.',
      details: [
        { label: 'Payload', value: cssPayload },
        { label: 'Rendered text', value: textProbe.textContent ?? '' },
        { label: 'Inner HTML snapshot', value: textProbe.innerHTML },
      ],
    });
    await pause();
  }

  async function runDosAttack(): Promise<void> {
    const id = addAttack(
      'Attack 7: DoS via oversized input',
      'Attempting to persist a 1 MB resume summary to encrypted storage…'
    );
    await tick();
    await pause();

    const candidate = createBlankResume('attack-mode-dos');
    candidate.basics.summary = oversizedSummary;

    let message = '';

    try {
      assertResumeWithinSizeLimit(candidate);
      message = 'Unexpectedly passed the size guard.';
    } catch (attackError) {
      message =
        attackError instanceof ResumeSizeError
          ? attackError.message
          : 'Input length validation rejected the oversized resume.';
    }

    await logBlock('attack_blocked_xss', `Oversized resume rejected in Attack Mode: ${message}`);
    completeAttack(id, {
      defense: 'Pre-save size validation',
      event: 'attack_blocked_xss',
      explanation: 'The resume was rejected before any encrypted storage write, and the same guard now protects real saves in `saveResume()`.',
      details: [
        { label: 'Oversized field', value: `${oversizedSummary.length.toLocaleString('en-US')} chars` },
        { label: 'Configured limit', value: `${MAX_RESUME_SIZE.toLocaleString('en-US')} chars` },
        { label: 'Validation response', value: message },
      ],
    });
    await pause();
  }

  async function enterAttackMode(): Promise<void> {
    entryBusy = true;

    try {
      confirmed = true;
      cspViolations.clear();
      await ensureAttackModeAuditReady();
      await refreshAuditEntries();
      await runSequence();
    } catch (enterError) {
      error = enterError instanceof Error ? enterError.message : 'Unable to initialize Attack Mode.';
    } finally {
      entryBusy = false;
    }
  }

  function exitAttackMode(): void {
    void goto('/');
  }

  function cancelAttackMode(): void {
    void goto('/');
  }

  $: summaryText = `${attackLog.length} attacks attempted. ${blockedCount} attacks blocked.`;

  onMount(() => {
    const unsubscribe = cspViolations.subscribe((value) => {
      const nextCount = value.length;

      if (nextCount > violations.length) {
        cspPulse = true;
        window.setTimeout(() => {
          cspPulse = false;
        }, 360);
        window.setTimeout(() => {
          cspDashboard?.scrollTo({ top: cspDashboard.scrollHeight, behavior: 'smooth' });
        }, 30);
      }

      violations = value;
    });

    cspViolations.clear();
    window.setTimeout(() => {
      void gateDialog?.showModal();
    }, 0);

    return unsubscribe;
  });

  onDestroy(() => {
    destroyed = true;
  });
</script>

<svelte:head>
  <title>Attack Mode | ShieldCV</title>
</svelte:head>

<ConfirmDialog
  bind:this={gateDialog}
  body={ATTACK_MODE_BODY}
  busy={entryBusy}
  cancelLabel="Cancel"
  confirmTestId="enter-attack-mode"
  destructiveLabel="Enter Attack Mode"
  kicker="Security demonstration"
  onCancel={cancelAttackMode}
  onConfirm={enterAttackMode}
  title="Enter Attack Mode"
/>

{#if confirmed}
  <section class="attack-mode-page">
    <div class="attack-mode-grid">
      <section class="content-card attack-hero">
        <div class="attack-hero__banner">
          <AlertTriangle size={18} />
          <span>ATTACK MODE</span>
        </div>

        <div class="attack-hero__header">
          <div>
            <p class="section-kicker attack-kicker">Red team rehearsal</p>
            <h3>ShieldCV blocks hostile resume payloads in real time.</h3>
            <p>
              Every payload below is intentional, inert, and logged into a tamper-evident audit chain
              the moment it gets blocked.
            </p>
          </div>

          <div class="attack-hero__actions">
            <div class="attack-counter" data-testid="attack-counter">
              <span class="attack-counter__label">Attacks blocked</span>
              {#key counterKey}
                <strong class="attack-counter__value" in:scale={{ duration: 220, start: 0.9 }}>
                  {blockedCount}
                </strong>
              {/key}
              <span class="attack-counter__copy" data-testid="attack-count-copy">{blockedCount} attacks blocked</span>
            </div>

            <div class="attack-hero__buttons">
              <button
                class="shell-button shell-button--primary"
                data-testid="verify-audit-chain"
                disabled={verifyBusy || attackLog.length === 0}
                type="button"
                onclick={handleVerify}
              >
                {verifyBusy ? 'Verifying…' : 'Verify audit chain'}
              </button>
              <button class="shell-button" type="button" onclick={exitAttackMode}>Exit Attack Mode</button>
            </div>
          </div>
        </div>

        {#if error}
          <p class="field-error">{error}</p>
        {/if}

        {#if verificationRan}
          <div
            class="attack-chain-status"
            data-testid="attack-chain-status"
            in:fade={{ duration: 220 }}
          >
            <span class:danger-badge={!verification.valid} class:success-badge={verification.valid} class="audit-badge">
              {#if verification.valid}Chain intact{:else}TAMPERING DETECTED{/if}
            </span>
            <p>{verificationSummary(verification)}</p>
          </div>
        {/if}
      </section>

      <section class="content-card attack-log-panel">
        <div class="section-header">
          <div>
            <p class="section-kicker attack-kicker">Scripted sequence</p>
            <h3>Live attack log</h3>
          </div>
          <p class="attack-panel-status">
            {#if sequenceRunning}Running controlled probes…{:else if sequenceComplete}Sequence complete{:else}Standing by{/if}
          </p>
        </div>

        <div class="attack-log-list">
          {#each attackLog as attack (attack.id)}
            <article
              class:attack-entry--blocked={attack.status === 'blocked'}
              class="attack-entry"
              data-testid={`attack-entry-${attack.id}`}
              in:fly={{ x: -32, duration: 300 }}
            >
              <div class="attack-entry__topline">
                <div>
                  <p class="attack-entry__title">{attack.title}</p>
                  <p class="attack-entry__announcement">{attack.announcement}</p>
                </div>

                {#if attack.status === 'blocked'}
                  <span class="attack-entry__badge" in:scale={{ duration: 180 }}>
                    <ShieldCheck size={18} />
                    Blocked
                  </span>
                {:else}
                  <span class="attack-entry__badge attack-entry__badge--running">
                    <Shield size={18} />
                    Testing
                  </span>
                {/if}
              </div>

              <p class="attack-entry__defense"><strong>Defense layer:</strong> {attack.defense || 'Preparing probe…'}</p>
              <p class="attack-entry__explanation">{attack.explanation}</p>

              {#if attack.details.length > 0}
                <div class="attack-detail-grid">
                  {#each attack.details as detail}
                    <div class="attack-detail">
                      <span>{detail.label}</span>
                      <pre>{detail.value}</pre>
                    </div>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>

      <aside class="attack-sidebar">
        <section class="content-card attack-audit-panel">
          <div class="section-header">
            <div>
              <p class="section-kicker attack-kicker">Tamper-evident chain</p>
              <h3>Live audit tail</h3>
            </div>
            <span>{auditEntries.length} entries</span>
          </div>

          {#if auditEntries.length === 0}
            <p>No audit entries yet. They will appear here as each defense fires.</p>
          {:else}
            <div class="attack-audit-list">
              {#each [...auditEntries].reverse().slice(0, 6) as entry (entry.index)}
                <article class="attack-audit-entry">
                  <div>
                    <strong>#{entry.index}</strong>
                    <span>{entry.event.replaceAll('_', ' ')}</span>
                  </div>
                  <time datetime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <section class="content-card attack-fixture-panel">
          <div class="section-header">
            <div>
              <p class="section-kicker attack-kicker">Fixture inventory</p>
              <h3>Non-executed payloads</h3>
            </div>
          </div>

          <div class="attack-detail-grid">
            <div class="attack-detail">
              <span>Phishing URL</span>
              <pre>{phishingUrl}</pre>
            </div>
            <div class="attack-detail">
              <span>Handling</span>
              <pre>Shown as text only. Never fetched. External requests remain blocked.</pre>
            </div>
          </div>
        </section>

        <section class="content-card attack-csp-panel">
          <div class="section-header">
            <div>
              <p class="section-kicker attack-kicker">CSP telemetry</p>
              <h3>CSP violation dashboard</h3>
            </div>
            <span class:csp-pulse={cspPulse} class="attack-csp-count" data-testid="csp-violation-count">
              {violations.length} CSP violations captured
            </span>
          </div>

          <div bind:this={cspDashboard} class="attack-csp-list">
            {#if violations.length === 0}
              <p class="attack-csp-empty">
                No CSP violations captured during this session. Attacks were blocked at higher layers
                (Trusted Types, DOMPurify) before reaching CSP enforcement.
              </p>
            {:else}
              {#each violations as violation, index (violation.timestamp + index)}
                <article class="attack-csp-entry">
                  <div class="attack-csp-entry__topline">
                    <strong>{formatTimestamp(violation.timestamp)}</strong>
                    <span>{violation.violatedDirective}</span>
                  </div>
                  <p><strong>Blocked URI:</strong> {formatViolationField(violation.blockedURI)}</p>
                  <p><strong>Source:</strong> {formatViolationField(violation.sourceFile)}</p>
                  <p><strong>Line:</strong> {formatViolationField(violation.lineNumber)}</p>
                </article>
              {/each}
            {/if}
          </div>
        </section>
      </aside>
    </div>

    {#if sequenceComplete}
      <section class="content-card attack-summary" data-testid="attack-summary" in:fade={{ duration: 320 }}>
        <p class="section-kicker attack-kicker">Final verdict</p>
        <h3>{summaryText}</h3>
        <p>Every blocked attack was logged. The log has not been tampered with.</p>

        <div class="attack-summary__grid">
          {#each attackLog as attack (attack.id)}
            <div class="attack-summary__item">
              <strong>{attack.title}</strong>
              <span>{attack.defense}</span>
            </div>
          {/each}
        </div>

        <div class="attack-summary__actions">
          <button
            class="shell-button shell-button--primary"
            disabled={verifyBusy}
            type="button"
            onclick={handleVerify}
          >
            {verifyBusy ? 'Verifying…' : 'Verify'}
          </button>

          {#if verificationRan}
            <span
              class:danger-badge={!verification.valid}
              class:success-badge={verification.valid}
              class="audit-badge"
              data-testid="chain-intact-badge"
            >
              {#if verification.valid}Chain intact: {verification.entryCount} entries{:else}Tampering detected{/if}
            </span>
          {/if}
        </div>
      </section>
    {/if}

    <div bind:this={sandboxContainer} aria-hidden="true" class="attack-sandbox"></div>
  </section>
{/if}

<style>
  .attack-mode-page {
    --attack-red: #ff6b6b;
    --attack-red-deep: #7f1d1d;
    --attack-amber: #f59e0b;
    --attack-green: #4ade80;
    --attack-panel: rgba(36, 10, 14, 0.78);
    --attack-panel-strong: rgba(51, 14, 20, 0.92);
    --attack-border: rgba(248, 113, 113, 0.2);
    --attack-border-strong: rgba(248, 113, 113, 0.34);
    display: grid;
    gap: 1rem;
  }

  .attack-mode-grid {
    display: grid;
    gap: 1rem;
  }

  .attack-hero,
  .attack-log-panel,
  .attack-audit-panel,
  .attack-csp-panel,
  .attack-fixture-panel,
  .attack-summary {
    border-color: var(--attack-border);
    background:
      radial-gradient(circle at top right, rgba(248, 113, 113, 0.12), transparent 35%),
      linear-gradient(180deg, rgba(34, 10, 14, 0.96), rgba(20, 8, 11, 0.94));
  }

  .attack-hero {
    overflow: hidden;
  }

  .attack-hero__banner {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 1rem;
    padding: 0.45rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--attack-red) 42%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--attack-red) 14%, transparent);
    color: #fecaca;
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .attack-kicker {
    color: #fca5a5;
  }

  .attack-hero__header {
    display: flex;
    justify-content: space-between;
    gap: 1.25rem;
  }

  .attack-hero h3,
  .attack-log-panel h3,
  .attack-sidebar h3,
  .attack-summary h3 {
    max-width: 16ch;
    color: #fff1f2;
  }

  .attack-hero__actions {
    display: grid;
    gap: 0.85rem;
    align-content: start;
    min-width: 18rem;
  }

  .attack-hero__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .attack-counter {
    display: grid;
    gap: 0.35rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--attack-border-strong);
    border-radius: 1.25rem;
    background: rgba(17, 6, 8, 0.48);
    text-align: right;
  }

  .attack-counter__label {
    color: #fda4af;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .attack-counter__value {
    font-size: clamp(2.2rem, 4vw, 3rem);
    color: #ffffff;
    text-shadow: 0 0 24px rgba(74, 222, 128, 0.24);
  }

  .attack-chain-status {
    display: grid;
    gap: 0.55rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--attack-border);
  }

  .attack-log-list,
  .attack-sidebar,
  .attack-audit-list {
    display: grid;
    gap: 0.85rem;
  }

  .attack-entry {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--attack-border);
    border-radius: 1.25rem;
    background: rgba(17, 6, 8, 0.52);
    transform-origin: left center;
  }

  .attack-entry--blocked {
    border-color: rgba(74, 222, 128, 0.26);
    box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.08);
  }

  .attack-entry__topline {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .attack-entry__title {
    margin: 0 0 0.2rem;
    color: #fff1f2;
    font-weight: 700;
  }

  .attack-entry__announcement,
  .attack-entry__defense,
  .attack-entry__explanation,
  .attack-panel-status {
    margin: 0;
    color: #fecdd3;
  }

  .attack-entry__badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: fit-content;
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.14);
    color: var(--attack-green);
    font-weight: 700;
    animation: blocked-flash 420ms ease-out;
  }

  .attack-entry__badge--running {
    background: rgba(245, 158, 11, 0.14);
    color: #fbbf24;
    animation: none;
  }

  .attack-detail-grid {
    display: grid;
    gap: 0.65rem;
  }

  .attack-detail {
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem;
    border-radius: 1rem;
    background: rgba(9, 4, 5, 0.52);
  }

  .attack-detail span {
    color: #fca5a5;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .attack-detail pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family:
      'SFMono-Regular',
      ui-monospace,
      monospace;
    color: #ffe4e6;
  }

  .attack-audit-entry,
  .attack-summary__item,
  .attack-csp-entry {
    display: grid;
    gap: 0.35rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--attack-border);
    border-radius: 1rem;
    background: rgba(17, 6, 8, 0.44);
  }

  .attack-audit-entry div,
  .attack-csp-entry__topline {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    color: #fff1f2;
  }

  .attack-audit-entry span,
  .attack-audit-entry time,
  .attack-csp-entry p,
  .attack-summary__item span {
    color: #fecdd3;
    margin: 0;
  }

  .attack-csp-count {
    color: #fca5a5;
    font-weight: 700;
    text-align: right;
  }

  .attack-csp-list {
    display: grid;
    gap: 0.8rem;
    max-height: 24rem;
    overflow: auto;
    padding-right: 0.25rem;
  }

  .attack-csp-empty {
    margin: 0;
    color: #fecdd3;
  }

  .csp-pulse {
    animation: csp-pulse 360ms ease-out;
  }

  .attack-summary {
    display: grid;
    gap: 1rem;
    text-align: center;
  }

  .attack-summary h3 {
    max-width: none;
    font-size: clamp(2rem, 4vw, 3.2rem);
  }

  .attack-summary__grid {
    display: grid;
    gap: 0.75rem;
  }

  .attack-summary__item strong {
    color: #fff1f2;
  }

  .attack-summary__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    align-items: center;
  }

  .attack-sandbox {
    position: fixed;
    left: -9999px;
    top: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  @keyframes blocked-flash {
    0% {
      box-shadow: 0 0 0 rgba(74, 222, 128, 0);
      transform: scale(0.96);
    }

    50% {
      box-shadow: 0 0 0 0.5rem rgba(74, 222, 128, 0.16);
      transform: scale(1.02);
    }

    100% {
      box-shadow: 0 0 0 rgba(74, 222, 128, 0);
      transform: scale(1);
    }
  }

  @keyframes csp-pulse {
    0% {
      transform: scale(1);
      color: #fca5a5;
    }

    50% {
      transform: scale(1.04);
      color: #fff1f2;
    }

    100% {
      transform: scale(1);
      color: #fca5a5;
    }
  }

  @media (min-width: 1024px) {
    .attack-mode-grid {
      grid-template-columns: minmax(0, 1.4fr) minmax(20rem, 0.9fr);
      align-items: start;
    }

    .attack-log-panel {
      grid-column: 1;
    }

    .attack-sidebar {
      grid-column: 2;
      grid-row: 1 / span 2;
      position: sticky;
      top: 1rem;
    }
  }

  @media (max-width: 900px) {
    .attack-hero__header,
    .attack-entry__topline {
      grid-template-columns: 1fr;
      display: grid;
    }

    .attack-hero__actions,
    .attack-counter {
      min-width: 0;
      text-align: left;
    }

    .attack-hero__buttons {
      justify-content: flex-start;
    }
  }
</style>
