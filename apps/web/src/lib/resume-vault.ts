import { createBlankResume, normalizeResumeDocument, type ResumeDocument } from '@shieldcv/resume';
import { EncryptedStore } from '@shieldcv/storage';
import { writable } from 'svelte/store';

const DATABASE_NAME = 'shieldcv-local-vault';
const RESUME_NAMESPACE = 'resume';

type VaultStatus = 'locked' | 'unlocking' | 'unlocked';

const vaultStatus = writable<VaultStatus>('locked');

let storePromise: Promise<EncryptedStore> | null = null;

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

export { vaultStatus };

export async function unlockVault(passphrase: string): Promise<void> {
  vaultStatus.set('unlocking');

  try {
    const store = await resumeStore();
    await store.unlock(passphrase);
    vaultStatus.set('unlocked');
  } catch (error) {
    vaultStatus.set('locked');
    throw error;
  }
}

export async function lockVault(): Promise<void> {
  const store = await resumeStore();
  store.lock();
  vaultStatus.set('locked');
}

export async function isVaultUnlocked(): Promise<boolean> {
  const store = await resumeStore();
  const unlocked = store.isUnlocked;
  vaultStatus.set(unlocked ? 'unlocked' : 'locked');
  return unlocked;
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
  const store = await resumeStore();
  await store.put(RESUME_NAMESPACE, normalized.id, normalized);
  return normalized;
}

export async function createResume(): Promise<ResumeDocument> {
  const resume = createBlankResume(globalThis.crypto.randomUUID());
  return saveResume(resume);
}

export async function deleteResume(id: string): Promise<void> {
  const store = await resumeStore();
  await store.delete(RESUME_NAMESPACE, id);
}
