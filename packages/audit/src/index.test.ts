import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuditStore = {
  get: <T>(namespace: string, key: string) => Promise<T | undefined>;
  put: <T>(namespace: string, key: string, value: T) => Promise<void>;
  list: (namespace: string) => Promise<string[]>;
  delete: (namespace: string, key: string) => Promise<void>;
};

const namespaces = new Map<string, Map<string, unknown>>();

function getNamespace(namespace: string): Map<string, unknown> {
  let store = namespaces.get(namespace);

  if (!store) {
    store = new Map<string, unknown>();
    namespaces.set(namespace, store);
  }

  return store;
}

const store: AuditStore = {
  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    return getNamespace(namespace).get(key) as T | undefined;
  },
  async put<T>(namespace: string, key: string, value: T): Promise<void> {
    getNamespace(namespace).set(key, structuredClone(value));
  },
  async list(namespace: string): Promise<string[]> {
    return Array.from(getNamespace(namespace).keys()).sort();
  },
  async delete(namespace: string, key: string): Promise<void> {
    getNamespace(namespace).delete(key);
  },
};

vi.mock('@shieldcv/storage', () => ({}));
vi.mock('@shieldcv/crypto', async () => {
  const crypto = await import('node:crypto');

  return {
    sha256Hex: async (value: string) =>
      crypto.createHash('sha256').update(value).digest('hex'),
  };
});

async function loadModule() {
  return import('./index');
}

describe('@shieldcv/audit', () => {
  beforeEach(() => {
    vi.resetModules();
    namespaces.clear();
    globalThis.__shieldcvAuditStore = store;
  });

  it('appendEntry creates an entry with correct fields', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    const entry = await audit.appendEntry('vault_unlocked', 'Unlocked vault');

    expect(entry.index).toBe(0);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.event).toBe('vault_unlocked');
    expect(entry.details).toBe('Unlocked vault');
    expect(entry.previousHash).toBe('0'.repeat(64));
    expect(entry.hash).toHaveLength(64);
  });

  it('appendEntry lazily initializes the chain head when initAudit was not called', async () => {
    const audit = await loadModule();

    const entry = await audit.appendEntry('vault_unlocked', 'Unlocked vault');

    expect(entry.index).toBe(0);
    expect(entry.previousHash).toBe('0'.repeat(64));
  });

  it('first entry has a previous hash of 64 zeros', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    const entry = await audit.appendEntry('vault_created', 'Created vault');

    expect(entry.previousHash).toBe('0'.repeat(64));
  });

  it("second entry's previous hash matches the first entry hash", async () => {
    const audit = await loadModule();
    await audit.initAudit();

    const first = await audit.appendEntry('vault_created', 'Created vault');
    const second = await audit.appendEntry('vault_unlocked', 'Unlocked vault');

    expect(second.previousHash).toBe(first.hash);
  });

  it('hash is deterministic for the same inputs', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    const first = await audit.appendEntry('resume_created', 'Created resume abc');
    const stored = await store.get<typeof first>('audit', 'entry-0000');

    expect(stored).toEqual(first);
  });

  it('verifyChain returns valid for a correct chain', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await audit.appendEntry('vault_created', 'Created vault');
    await audit.appendEntry('vault_unlocked', 'Unlocked vault');

    await expect(audit.verifyChain()).resolves.toMatchObject({
      valid: true,
      entryCount: 2,
      brokenAtIndex: null,
      error: null,
    });
  });

  it('verifyChain detects a tampered entry', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await audit.appendEntry('resume_created', 'Created resume abc');
    await audit.appendEntry('resume_updated', 'Updated resume abc');

    const second = await store.get<Record<string, unknown>>('audit', 'entry-0001');
    await store.put('audit', 'entry-0001', {
      ...second,
      details: 'Tampered details',
    });

    await expect(audit.verifyChain()).resolves.toMatchObject({
      valid: false,
      brokenAtIndex: 1,
    });
  });

  it('verifyChain detects a missing entry', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await audit.appendEntry('resume_created', 'Created resume abc');
    await audit.appendEntry('resume_updated', 'Updated resume abc');
    await audit.appendEntry('scan_completed', 'Completed scan');
    await store.delete('audit', 'entry-0001');

    await expect(audit.verifyChain()).resolves.toMatchObject({
      valid: false,
      brokenAtIndex: 1,
    });
  });

  it('verifyChain detects a mismatched previous hash', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await audit.appendEntry('resume_created', 'Created resume abc');
    const second = await audit.appendEntry('resume_updated', 'Updated resume abc');
    await store.put('audit', 'entry-0001', {
      ...second,
      previousHash: 'f'.repeat(64),
    });

    await expect(audit.verifyChain()).resolves.toMatchObject({
      valid: false,
      brokenAtIndex: 1,
      error: 'Entry 1 points to an unexpected previous hash.',
    });
  });

  it('verifyChain returns valid and entryCount 0 for an empty log', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await expect(audit.verifyChain()).resolves.toEqual({
      valid: true,
      entryCount: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      brokenAtIndex: null,
      error: null,
    });
  });

  it('getEntries returns entries in order', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await audit.appendEntry('vault_created', 'Created vault');
    await audit.appendEntry('resume_created', 'Created resume abc');

    await expect(audit.getEntries()).resolves.toMatchObject([
      { index: 0, event: 'vault_created' },
      { index: 1, event: 'resume_created' },
    ]);
  });

  it('getEntries lazily initializes from existing storage', async () => {
    const audit = await loadModule();

    await store.put('audit', 'entry-0000', {
      index: 0,
      timestamp: '2026-04-10T16:00:00.000Z',
      event: 'vault_created',
      details: 'Created vault',
      previousHash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    });

    await expect(audit.getEntries()).resolves.toHaveLength(1);
  });

  it('exportLog produces valid parseable JSON', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    await audit.appendEntry('vault_created', 'Created vault');
    const exported = audit.exportLog(await audit.getEntries());

    expect(JSON.parse(exported)).toMatchObject([{ index: 0, event: 'vault_created' }]);
  });

  it('initAudit correctly resumes from the existing chain head', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    const first = await audit.appendEntry('vault_created', 'Created vault');
    await audit.initAudit();
    const second = await audit.appendEntry('vault_unlocked', 'Unlocked vault');

    expect(second.index).toBe(1);
    expect(second.previousHash).toBe(first.hash);
  });

  it('concurrent appendEntry calls produce sequential indices', async () => {
    const audit = await loadModule();
    await audit.initAudit();

    const entries = await Promise.all([
      audit.appendEntry('vault_created', 'Created vault'),
      audit.appendEntry('vault_unlocked', 'Unlocked vault'),
      audit.appendEntry('resume_created', 'Created resume abc'),
      audit.appendEntry('scan_completed', 'Completed scan'),
    ]);

    expect(entries.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
    await expect(audit.verifyChain()).resolves.toMatchObject({
      valid: true,
      entryCount: 4,
    });
  });

  it('throws a clear error when the audit store is unavailable', async () => {
    const audit = await loadModule();
    globalThis.__shieldcvAuditStore = undefined;

    await expect(audit.initAudit()).rejects.toThrow(
      'Audit storage is unavailable. Unlock the vault and call initAudit() first.'
    );
  });

  it('verificationSummary returns the expected messages', async () => {
    const audit = await loadModule();

    expect(
      audit.verificationSummary({
        valid: true,
        entryCount: 0,
        firstTimestamp: null,
        lastTimestamp: null,
        brokenAtIndex: null,
        error: null,
      })
    ).toBe('Empty log: no entries to verify.');

    expect(
      audit.verificationSummary({
        valid: false,
        entryCount: 2,
        firstTimestamp: '2026-04-10T16:00:00.000Z',
        lastTimestamp: '2026-04-16T16:00:00.000Z',
        brokenAtIndex: 12,
        error: 'bad',
      })
    ).toBe('TAMPERING DETECTED at entry #12. Chain broken.');

    expect(
      audit.verificationSummary({
        valid: false,
        entryCount: 2,
        firstTimestamp: '2026-04-10T16:00:00.000Z',
        lastTimestamp: '2026-04-16T16:00:00.000Z',
        brokenAtIndex: null,
        error: 'bad',
      })
    ).toBe('TAMPERING DETECTED at entry #?. Chain broken.');

    expect(
      audit.verificationSummary({
        valid: true,
        entryCount: 1,
        firstTimestamp: '2026-04-10T16:00:00.000Z',
        lastTimestamp: '2026-04-10T16:00:00.000Z',
        brokenAtIndex: null,
        error: null,
      })
    ).toBe('Chain intact: 1 entry from Apr 10 to Apr 10');

    expect(
      audit.verificationSummary({
        valid: true,
        entryCount: 3,
        firstTimestamp: null,
        lastTimestamp: null,
        brokenAtIndex: null,
        error: null,
      })
    ).toBe('Chain intact: 3 entries');
  });
});
