<script lang="ts">
  import { onMount } from 'svelte';
  import {
    AlertTriangle,
    Download,
    FileText,
    Search,
    Shield,
  } from 'lucide-svelte';
  import {
    appendEntry,
    exportLog,
    getEntries,
    verificationSummary,
    verifyChain,
    type AuditEntry,
    type AuditEvent,
    type ChainVerification,
  } from '@shieldcv/audit';
  import { bindAttackModeAuditIfAvailable } from '$lib/demo-audit';
  import VaultUnlockPanel from '$lib/components/VaultUnlockPanel.svelte';
  import { isVaultUnlocked, unlockVault } from '$lib/resume-vault';

  type EventMeta = {
    colorClass: string;
    icon: typeof Shield;
    label: string;
  };

  let entries: AuditEntry[] = [];
  let verification: ChainVerification = {
    valid: true,
    entryCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    brokenAtIndex: null,
    error: null,
  };
  let loading = true;
  let unlockBusy = false;
  let verifyBusy = false;
  let exportBusy = false;
  let unlocked = false;
  let usingAttackModeAudit = false;
  let error = '';
  let expandedEntries = new Set<number>();
  let newestFirstEntries: AuditEntry[] = [];

  function auditWarn(context: string, auditError: unknown) {
    console.warn(`Audit log write failed after ${context}.`, auditError);
  }

  function eventMeta(event: AuditEvent): EventMeta {
    if (event.startsWith('vault_')) {
      return { colorClass: 'audit-event--vault', icon: Shield, label: event.replaceAll('_', ' ') };
    }

    if (event.startsWith('resume_')) {
      return { colorClass: 'audit-event--resume', icon: FileText, label: event.replaceAll('_', ' ') };
    }

    if (event.startsWith('scan_')) {
      return { colorClass: 'audit-event--scan', icon: Search, label: event.replaceAll('_', ' ') };
    }

    if (event.startsWith('attack_')) {
      return { colorClass: 'audit-event--attack', icon: AlertTriangle, label: event.replaceAll('_', ' ') };
    }

    return { colorClass: 'audit-event--export', icon: Download, label: event.replaceAll('_', ' ') };
  }

  function formatRelativeTime(timestamp: string): string {
    const deltaSeconds = Math.round((new Date(timestamp).getTime() - Date.now()) / 1_000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['day', 86_400],
      ['hour', 3_600],
      ['minute', 60],
      ['second', 1],
    ];

    for (const [unit, size] of units) {
      if (Math.abs(deltaSeconds) >= size || unit === 'second') {
        return formatter.format(Math.round(deltaSeconds / size), unit);
      }
    }

    return timestamp;
  }

  function formatRange(timestamp: string | null): string {
    if (!timestamp) {
      return 'Not available';
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  }

  function shortHash(hash: string): string {
    return hash.slice(0, 12);
  }

  function toggleEntry(index: number): void {
    const next = new Set(expandedEntries);

    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }

    expandedEntries = next;
  }

  async function loadAudit(): Promise<void> {
    loading = true;

    try {
      const [nextEntries, nextVerification] = await Promise.all([getEntries(), verifyChain()]);
      entries = nextEntries;
      verification = nextVerification;
      error = '';
      unlocked = true;
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : 'Unable to load the audit log.';
    } finally {
      loading = false;
    }
  }

  async function handleUnlock(passphrase: string): Promise<void> {
    unlockBusy = true;

    try {
      await unlockVault(passphrase);
      await loadAudit();
    } catch (unlockError) {
      error = unlockError instanceof Error ? unlockError.message : 'Unable to unlock the audit log.';
    } finally {
      unlockBusy = false;
    }
  }

  async function handleVerify(): Promise<void> {
    verifyBusy = true;

    try {
      verification = await verifyChain();
    } catch (verifyError) {
      error = verifyError instanceof Error ? verifyError.message : 'Unable to verify the audit chain.';
    } finally {
      verifyBusy = false;
    }
  }

  async function handleExport(): Promise<void> {
    exportBusy = true;

    try {
      try {
        await appendEntry('export_audit_log', `Exported audit log with ${entries.length} entries.`);
      } catch (auditError) {
        auditWarn('audit export', auditError);
      }

      await loadAudit();

      const blob = new Blob([exportLog(entries)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'shieldcv-audit-log.json';
      link.click();
      URL.revokeObjectURL(href);
    } finally {
      exportBusy = false;
    }
  }

  onMount(async () => {
    unlocked = await isVaultUnlocked();

    if (unlocked) {
      await loadAudit();
      usingAttackModeAudit = false;
    } else {
      usingAttackModeAudit = await bindAttackModeAuditIfAvailable();

      if (usingAttackModeAudit) {
        await loadAudit();
      } else {
        loading = false;
      }
    }
  });

  $: newestFirstEntries = [...entries].reverse();
</script>

<svelte:head>
  <title>Audit Log | ShieldCV</title>
</svelte:head>

{#if !unlocked && !usingAttackModeAudit}
  <VaultUnlockPanel
    busy={unlockBusy}
    copy="Unlock your on-device vault to inspect the tamper-evident audit chain and export it as evidence."
    error={error}
    onUnlock={handleUnlock}
    title="Unlock to view the audit log"
  />
{:else}
  <section class="content-card audit-header">
    <div class="section-header">
      <div>
        <p class="section-kicker">{usingAttackModeAudit ? 'Attack Mode Evidence' : 'Security Evidence'}</p>
        <h3>Audit Log</h3>
      </div>

      <div class="header-actions">
        <button class="shell-button" type="button" disabled={verifyBusy || loading} onclick={handleVerify}>
          {verifyBusy ? 'Verifying…' : 'Verify chain'}
        </button>
        <button
          class="shell-button shell-button--primary"
          type="button"
          disabled={exportBusy || loading}
          onclick={handleExport}
        >
          {exportBusy ? 'Exporting…' : 'Export log'}
        </button>
      </div>
    </div>

    <div class="audit-summary">
      <span class:danger-badge={!verification.valid} class:success-badge={verification.valid} class="audit-badge">
        {#if verification.valid}Chain intact{:else}TAMPERING DETECTED{/if}
      </span>
      {#if usingAttackModeAudit}
        <p>This view is showing the self-contained Attack Mode demo chain from the current browser session.</p>
      {/if}
      <p>{verificationSummary(verification)}</p>
      <div class="audit-metadata">
        <span><strong>{verification.entryCount}</strong> entries</span>
        <span>{formatRange(verification.firstTimestamp)} to {formatRange(verification.lastTimestamp)}</span>
      </div>
      {#if verification.error}
        <p class="field-error">{verification.error}</p>
      {/if}
    </div>
  </section>

  {#if loading}
    <section class="content-card">
      <p>Loading audit entries…</p>
    </section>
  {:else if newestFirstEntries.length === 0}
    <section class="content-card empty-state">
      <p class="section-kicker">Waiting For Activity</p>
      <h3>No audit entries yet</h3>
      <p>No audit entries yet. Events will be recorded as you use ShieldCV.</p>
    </section>
  {:else}
    <section class="audit-list">
      {#each newestFirstEntries as entry (entry.index)}
        {@const meta = eventMeta(entry.event)}
        {@const Icon = meta.icon}
        <article class="content-card audit-entry">
          <div class="audit-entry__topline">
            <span class="audit-index">#{entry.index}</span>
            <button class="audit-expand" type="button" onclick={() => toggleEntry(entry.index)}>
              {expandedEntries.has(entry.index) ? 'Hide details' : 'Details'}
            </button>
          </div>

          <div class="audit-entry__main">
            <div class={`audit-event ${meta.colorClass}`}>
              <Icon size={16} />
              <span>{meta.label}</span>
            </div>
            <time class="audit-timestamp" datetime={entry.timestamp} title={entry.timestamp}>
              {formatRelativeTime(entry.timestamp)}
            </time>
          </div>

          <p class="audit-details">{entry.details}</p>

          <div class="audit-hash-row">
            <span class="audit-hash-label">hash</span>
            <code title={entry.hash}>{shortHash(entry.hash)}</code>
          </div>

          <div class="audit-hash-row">
            <span class="audit-hash-label">prev</span>
            <code title={entry.previousHash}>{shortHash(entry.previousHash)}</code>
          </div>

          <div class:expanded={expandedEntries.has(entry.index)} class="audit-expanded">
            <p class="audit-expanded__line">
              <strong>Details:</strong> <span>{entry.details}</span>
            </p>
            <p class="audit-expanded__line">
              <strong>Timestamp:</strong> <span>{entry.timestamp}</span>
            </p>
            <p class="audit-expanded__line">
              <strong>Hash:</strong> <code>{entry.hash}</code>
            </p>
            <p class="audit-expanded__line">
              <strong>Previous:</strong> <code>{entry.previousHash}</code>
            </p>
          </div>
        </article>
      {/each}
    </section>
  {/if}
{/if}
