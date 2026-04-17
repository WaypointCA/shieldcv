import { initAudit } from '@shieldcv/audit';
import { EncryptedStore } from '@shieldcv/storage';

export const ATTACK_MODE_AUDIT_DATABASE_NAME = 'shieldcv-attack-mode-audit';
const ATTACK_MODE_AUDIT_PASSPHRASE = 'shieldcv-attack-mode-demo';
export const ATTACK_MODE_AUDIT_FLAG = 'shieldcv.attackModeAuditReady';

type AuditStoreBinding = Pick<EncryptedStore, 'get' | 'put' | 'list' | 'delete'>;

let attackModeStorePromise: Promise<EncryptedStore> | null = null;

function bindAuditStore(store: AuditStoreBinding | undefined): void {
  globalThis.__shieldcvAuditStore = store;
}

async function attackModeStore(): Promise<EncryptedStore> {
  if (attackModeStorePromise === null) {
    attackModeStorePromise = EncryptedStore.open(ATTACK_MODE_AUDIT_DATABASE_NAME);
  }

  return attackModeStorePromise;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export async function ensureAttackModeAuditReady(): Promise<void> {
  if (globalThis.__shieldcvAuditStore) {
    await initAudit();
    return;
  }

  const store = await attackModeStore();

  if (!store.isUnlocked) {
    await store.unlock(ATTACK_MODE_AUDIT_PASSPHRASE);
  }

  bindAuditStore(store);
  await initAudit();

  if (canUseLocalStorage()) {
    window.localStorage.setItem(ATTACK_MODE_AUDIT_FLAG, '1');
  }
}

export async function bindAttackModeAuditIfAvailable(): Promise<boolean> {
  if (globalThis.__shieldcvAuditStore) {
    await initAudit();
    return true;
  }

  if (!canUseLocalStorage() || window.localStorage.getItem(ATTACK_MODE_AUDIT_FLAG) !== '1') {
    return false;
  }

  const store = await attackModeStore();

  if (!store.isUnlocked) {
    await store.unlock(ATTACK_MODE_AUDIT_PASSPHRASE);
  }

  bindAuditStore(store);
  await initAudit();
  return true;
}
