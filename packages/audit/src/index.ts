import { sha256Hex } from '@shieldcv/crypto';
import type { EncryptedStore } from '@shieldcv/storage';

const AUDIT_NAMESPACE = 'audit';
const ZERO_HASH = '0'.repeat(64);

type AuditStore = Pick<EncryptedStore, 'get' | 'put' | 'list' | 'delete'>;

export interface AuditEntry {
  index: number;
  timestamp: string;
  event: AuditEvent;
  details: string;
  previousHash: string;
  hash: string;
}

export type AuditEvent =
  | 'vault_created'
  | 'vault_unlocked'
  | 'vault_locked'
  | 'vault_destroyed'
  | 'application_created'
  | 'application_updated'
  | 'application_deleted'
  | 'resume_created'
  | 'resume_updated'
  | 'resume_deleted'
  | 'resume_imported_pdf'
  | 'scan_completed'
  | 'scan_phi_detected'
  | 'attack_blocked_xss'
  | 'attack_blocked_prototype_pollution'
  | 'attack_blocked_csp_violation'
  | 'attack_blocked_trusted_types'
  | 'export_audit_log';

export interface ChainVerification {
  valid: boolean;
  entryCount: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  brokenAtIndex: number | null;
  error: string | null;
}

type ChainHead = {
  index: number;
  hash: string;
};

let initialized = false;
let chainHead: ChainHead = {
  index: -1,
  hash: ZERO_HASH,
};
let operationQueue = Promise.resolve();

function auditStore(): AuditStore {
  const store = globalThis.__shieldcvAuditStore;

  if (!store) {
    throw new Error('Audit storage is unavailable. Unlock the vault and call initAudit() first.');
  }

  return store;
}

function entryKey(index: number): string {
  return `entry-${index.toString().padStart(4, '0')}`;
}

/**
 * Computes the deterministic hash-chain payload:
 * `${entry.index}|${entry.timestamp}|${entry.event}|${entry.details}|${entry.previousHash}`
 */
function hashPayload(entry: Omit<AuditEntry, 'hash'>): string {
  return `${entry.index}|${entry.timestamp}|${entry.event}|${entry.details}|${entry.previousHash}`;
}

async function computeHash(entry: Omit<AuditEntry, 'hash'>): Promise<string> {
  return sha256Hex(hashPayload(entry));
}

async function loadEntries(): Promise<AuditEntry[]> {
  const store = auditStore();
  const keys: string[] = await store.list(AUDIT_NAMESPACE);
  const entries = await Promise.all(
    keys.map((key: string) => store.get<AuditEntry>(AUDIT_NAMESPACE, key))
  );

  return entries.filter((entry): entry is AuditEntry => entry !== undefined);
}

function setChainHead(entries: AuditEntry[]): void {
  const lastEntry = entries.at(-1);
  chainHead = lastEntry
    ? { index: lastEntry.index, hash: lastEntry.hash }
    : { index: -1, hash: ZERO_HASH };
  initialized = true;
}

function serializeOperation<T>(task: () => Promise<T>): Promise<T> {
  const next = operationQueue.then(task, task);
  operationQueue = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    const entries = await loadEntries();
    setChainHead(entries);
  }
}

function invalidResult(
  entries: AuditEntry[],
  brokenAtIndex: number,
  error: string
): ChainVerification {
  return {
    valid: false,
    entryCount: entries.length,
    firstTimestamp: entries[0]!.timestamp,
    lastTimestamp: entries[entries.length - 1]!.timestamp,
    brokenAtIndex,
    error,
  };
}

export async function appendEntry(event: AuditEvent, details: string): Promise<AuditEntry> {
  return serializeOperation(async () => {
    if (!initialized) {
      const entries = await loadEntries();
      setChainHead(entries);
    }

    const entry: Omit<AuditEntry, 'hash'> = {
      index: chainHead.index + 1,
      timestamp: new Date().toISOString(),
      event,
      details,
      previousHash: chainHead.hash,
    };
    const hash = await computeHash(entry);
    const completeEntry: AuditEntry = { ...entry, hash };

    await auditStore().put(AUDIT_NAMESPACE, entryKey(completeEntry.index), completeEntry);

    chainHead = {
      index: completeEntry.index,
      hash: completeEntry.hash,
    };

    return completeEntry;
  });
}

export async function getEntries(): Promise<AuditEntry[]> {
  await ensureInitialized();
  return loadEntries();
}

export async function verifyChain(): Promise<ChainVerification> {
  await ensureInitialized();
  const entries = await loadEntries();

  if (entries.length === 0) {
    return {
      valid: true,
      entryCount: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      brokenAtIndex: null,
      error: null,
    };
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedPreviousHash = index === 0 ? ZERO_HASH : entries[index - 1]?.hash;

    if (!entry || entry.index !== index) {
      return invalidResult(
        entries,
        index,
        `Missing or out-of-sequence entry at index ${index}.`
      );
    }

    if (entry.previousHash !== expectedPreviousHash) {
      return invalidResult(
        entries,
        entry.index,
        `Entry ${entry.index} points to an unexpected previous hash.`
      );
    }

    const computedHash = await computeHash({
      index: entry.index,
      timestamp: entry.timestamp,
      event: entry.event,
      details: entry.details,
      previousHash: entry.previousHash,
    });

    if (entry.hash !== computedHash) {
      return invalidResult(entries, entry.index, `Entry ${entry.index} hash does not match its contents.`);
    }
  }

  return {
    valid: true,
    entryCount: entries.length,
    firstTimestamp: entries[0]!.timestamp,
    lastTimestamp: entries[entries.length - 1]!.timestamp,
    brokenAtIndex: null,
    error: null,
  };
}

export function exportLog(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export async function initAudit(): Promise<void> {
  await serializeOperation(async () => {
    const entries = await loadEntries();
    setChainHead(entries);
  });
}

function formatSummaryDate(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

export function verificationSummary(v: ChainVerification): string {
  if (v.entryCount === 0) {
    return 'Empty log: no entries to verify.';
  }

  if (!v.valid) {
    return `TAMPERING DETECTED at entry #${v.brokenAtIndex ?? '?'}. Chain broken.`;
  }

  const start = formatSummaryDate(v.firstTimestamp);
  const end = formatSummaryDate(v.lastTimestamp);
  const entryLabel = v.entryCount === 1 ? 'entry' : 'entries';

  if (start && end) {
    return `Chain intact: ${v.entryCount} ${entryLabel} from ${start} to ${end}`;
  }

  return `Chain intact: ${v.entryCount} ${entryLabel}`;
}
