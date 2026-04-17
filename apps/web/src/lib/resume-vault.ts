import { appendEntry, getEntries, initAudit, type AuditEvent } from '@shieldcv/audit';
import type { ApplicationRecord } from '@shieldcv/compliance';
import { createBlankResume, normalizeResumeDocument, type ResumeDocument } from '@shieldcv/resume';
import { EncryptedStore } from '@shieldcv/storage';
import { writable } from 'svelte/store';
import { ATTACK_MODE_AUDIT_DATABASE_NAME, ATTACK_MODE_AUDIT_FLAG } from '$lib/demo-audit';

const DATABASE_NAME = 'shieldcv-local-vault';
const RESUME_NAMESPACE = 'resume';
const GDPR_APPLICATION_NAMESPACE = 'gdpr-applications';
export const MAX_RESUME_SIZE = 500_000;

type VaultStatus = 'locked' | 'unlocking' | 'unlocked';
type AuditStoreBinding = Pick<EncryptedStore, 'get' | 'put' | 'list' | 'delete'>;

const vaultStatus = writable<VaultStatus>('locked');

let storePromise: Promise<EncryptedStore> | null = null;

export class ResumeSizeError extends Error {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number) {
    super(
      `Input exceeds maximum size (${size.toLocaleString('en-US')} chars > ${limit.toLocaleString('en-US')} limit). Rejected.`
    );
    this.name = 'ResumeSizeError';
    this.size = size;
    this.limit = limit;
  }
}

function resumeStore(): Promise<EncryptedStore> {
  if (storePromise === null) {
    storePromise = EncryptedStore.open(DATABASE_NAME);
  }

  return storePromise;
}

function ensureUpdatedTimestamp(document: ResumeDocument): ResumeDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  };
}

export function measureResumeSize(document: ResumeDocument): number {
  return JSON.stringify(document).length;
}

export function assertResumeWithinSizeLimit(document: ResumeDocument): void {
  const size = measureResumeSize(document);

  if (size > MAX_RESUME_SIZE) {
    throw new ResumeSizeError(size, MAX_RESUME_SIZE);
  }
}

export { vaultStatus };

function bindAuditStore(store: AuditStoreBinding | undefined): void {
  globalThis.__shieldcvAuditStore = store;
}

function fireAndForgetAudit(event: AuditEvent, details: string): void {
  void appendEntry(event, details).catch((error) => {
    console.warn('Audit log write failed.', error);
  });
}

export async function unlockVault(passphrase: string): Promise<void> {
  vaultStatus.set('unlocking');

  try {
    const store = await resumeStore();
    await store.unlock(passphrase);
    bindAuditStore(store);
    await initAudit();

    if ((await getEntries()).length === 0) {
      fireAndForgetAudit('vault_created', 'Created encrypted resume vault.');
    }

    fireAndForgetAudit('vault_unlocked', 'Unlocked encrypted resume vault.');
    vaultStatus.set('unlocked');
  } catch (error) {
    bindAuditStore(undefined);
    vaultStatus.set('locked');
    throw error;
  }
}

export async function lockVault(): Promise<void> {
  const store = await resumeStore();
  try {
    await appendEntry('vault_locked', 'Locked encrypted resume vault.');
  } catch (error) {
    console.warn('Audit log write failed.', error);
  }
  store.lock();
  bindAuditStore(undefined);
  vaultStatus.set('locked');
}

export async function isVaultUnlocked(): Promise<boolean> {
  const store = await resumeStore();
  const unlocked = store.isUnlocked;
  vaultStatus.set(unlocked ? 'unlocked' : 'locked');
  return unlocked;
}

export async function hasExistingVault(): Promise<boolean> {
  return EncryptedStore.hasSentinel(DATABASE_NAME);
}

export async function listResumes(): Promise<ResumeDocument[]> {
  const store = await resumeStore();
  const ids = await store.list(RESUME_NAMESPACE);
  const resumes = await Promise.all(ids.map((id) => store.get<ResumeDocument>(RESUME_NAMESPACE, id)));

  return resumes
    .filter((resume): resume is ResumeDocument => resume !== undefined)
    .map((resume) => normalizeResumeDocument(resume))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getResume(id: string): Promise<ResumeDocument | undefined> {
  const store = await resumeStore();
  const resume = await store.get<ResumeDocument>(RESUME_NAMESPACE, id);
  return resume ? normalizeResumeDocument(resume) : undefined;
}

export async function saveResume(document: ResumeDocument): Promise<ResumeDocument> {
  const normalized = normalizeResumeDocument(ensureUpdatedTimestamp(document));
  assertResumeWithinSizeLimit(normalized);
  const store = await resumeStore();
  await store.put(RESUME_NAMESPACE, normalized.id, normalized);
  return normalized;
}

export async function createResume(): Promise<ResumeDocument> {
  const resume = createBlankResume(globalThis.crypto.randomUUID());
  const savedResume = await saveResume(resume);
  fireAndForgetAudit('resume_created', `Created resume ${savedResume.id}`);
  return savedResume;
}

export async function deleteResume(id: string): Promise<void> {
  const store = await resumeStore();
  await store.delete(RESUME_NAMESPACE, id);
  fireAndForgetAudit('resume_deleted', `Deleted resume ${id}`);
}

export async function listGdprApplications(): Promise<ApplicationRecord[]> {
  const store = await resumeStore();
  const ids = await store.list(GDPR_APPLICATION_NAMESPACE);
  const records = await Promise.all(
    ids.map((id) => store.get<ApplicationRecord>(GDPR_APPLICATION_NAMESPACE, id)),
  );

  return records
    .filter((record): record is ApplicationRecord => record !== undefined)
    .sort((left, right) => right.dateApplied.localeCompare(left.dateApplied));
}

export async function saveGdprApplication(record: ApplicationRecord): Promise<ApplicationRecord> {
  const store = await resumeStore();
  await store.put(GDPR_APPLICATION_NAMESPACE, record.id, record);
  return record;
}

export async function deleteGdprApplication(id: string): Promise<void> {
  const store = await resumeStore();
  await store.delete(GDPR_APPLICATION_NAMESPACE, id);
}

function clearBrowserStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.clear();
  window.sessionStorage.clear();
}

async function closeVaultStore(): Promise<void> {
  if (storePromise === null) {
    return;
  }

  const existingStorePromise = storePromise;
  storePromise = null;

  try {
    const store = await existingStorePromise;
    store.close();
  } catch (error) {
    console.warn('Unable to close the existing vault database connection before reset.', error);
  }
}

export async function destroyVault(): Promise<void> {
  let unlocked = false;

  try {
    unlocked = await isVaultUnlocked();
  } catch (error) {
    console.warn('Unable to inspect vault state before reset.', error);
  }

  if (unlocked) {
    try {
      await appendEntry('vault_destroyed', 'Destroyed encrypted resume vault and cleared local data.');
    } catch (error) {
      console.warn('Audit log write failed before vault reset.', error);
    }
  }

  bindAuditStore(undefined);
  await closeVaultStore();
  await EncryptedStore.destroy(DATABASE_NAME);
  await EncryptedStore.destroy(ATTACK_MODE_AUDIT_DATABASE_NAME);
  clearBrowserStorage();
  vaultStatus.set('locked');
  bindAuditStore(undefined);

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(ATTACK_MODE_AUDIT_FLAG);
  }
}
