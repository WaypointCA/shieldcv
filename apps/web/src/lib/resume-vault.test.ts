import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankResume } from '@shieldcv/resume';
import { appendEntry } from '@shieldcv/audit';
import { EncryptedStore } from '@shieldcv/storage';
import {
  assertResumeWithinSizeLimit,
  destroyVault,
  hasExistingVault,
  MAX_RESUME_SIZE,
  measureResumeSize,
  ResumeSizeError,
} from './resume-vault';

vi.mock('@shieldcv/audit', () => ({
  appendEntry: vi.fn(),
  getEntries: vi.fn(async () => []),
  initAudit: vi.fn(async () => undefined),
}));

vi.mock('@shieldcv/storage', () => ({
  EncryptedStore: {
    open: vi.fn(),
    destroy: vi.fn(async () => undefined),
    hasSentinel: vi.fn(async () => true),
  },
}));

vi.mock('$lib/demo-audit', () => ({
  ATTACK_MODE_AUDIT_DATABASE_NAME: 'shieldcv-attack-mode-audit',
  ATTACK_MODE_AUDIT_FLAG: 'shieldcv.attackModeAuditReady',
}));

describe('resume vault size guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        clear: vi.fn(),
      },
    });
  });

  it('accepts resumes that fit within the configured size limit', () => {
    const resume = createBlankResume('resume-within-limit');
    resume.basics.summary = 'A concise summary.';

    expect(() => assertResumeWithinSizeLimit(resume)).not.toThrow();
  });

  it('rejects resumes that exceed the configured size limit before storage writes', () => {
    const resume = createBlankResume('resume-too-large');
    resume.basics.summary = 'A'.repeat(MAX_RESUME_SIZE);

    const size = measureResumeSize(resume);

    expect(size).toBeGreaterThan(MAX_RESUME_SIZE);

    try {
      assertResumeWithinSizeLimit(resume);
      throw new Error('Expected ResumeSizeError to be thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeSizeError);
      expect((error as ResumeSizeError).size).toBe(size);
      expect((error as ResumeSizeError).limit).toBe(MAX_RESUME_SIZE);
      expect((error as ResumeSizeError).message).toContain('Input exceeds maximum size');
    }
  });

  it('reports whether a vault already exists', async () => {
    vi.mocked(EncryptedStore.hasSentinel).mockResolvedValueOnce(false);

    await expect(hasExistingVault()).resolves.toBe(false);
    expect(EncryptedStore.hasSentinel).toHaveBeenCalledWith('shieldcv-local-vault');
  });

  it('resets storage without writing an audit event when the vault is locked', async () => {
    vi.mocked(EncryptedStore.open).mockResolvedValueOnce({
      close: vi.fn(),
      isUnlocked: false,
    } as never);

    await destroyVault();

    expect(appendEntry).not.toHaveBeenCalled();
    expect(EncryptedStore.destroy).toHaveBeenCalledWith('shieldcv-local-vault');
    expect(EncryptedStore.destroy).toHaveBeenCalledWith('shieldcv-attack-mode-audit');
    expect(window.localStorage.clear).toHaveBeenCalledOnce();
    expect(window.sessionStorage.clear).toHaveBeenCalledOnce();
  });

  it('writes a vault_destroyed audit event when the vault is unlocked', async () => {
    vi.mocked(EncryptedStore.open).mockResolvedValueOnce({
      close: vi.fn(),
      isUnlocked: true,
    } as never);

    await destroyVault();

    expect(appendEntry).toHaveBeenCalledWith(
      'vault_destroyed',
      'Destroyed encrypted resume vault and cleared local data.'
    );
  });
});
