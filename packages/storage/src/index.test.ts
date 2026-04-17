import 'fake-indexeddb/auto';

import { deriveKey, encrypt } from '@shieldcv/crypto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';

import { EncryptedStore, NotUnlockedError } from './index';

const META_STORE = 'meta';
const DATA_STORE = 'data';

interface RawMetaRecord {
  key: string;
  value: unknown;
}

interface RawDataRecord {
  id: string;
  namespace: string;
  key: string;
  bundle: {
    version: number;
    ciphertext: Uint8Array;
    iv: Uint8Array;
  };
}

function createDbName(): string {
  return `shieldcv-storage-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

describe('@shieldcv/storage', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = createDbName();
  });

  it('open() creates a fresh DB with meta store populated', async () => {
    const store = await EncryptedStore.open(dbName);

    expect(store.isUnlocked).toBe(false);
    expect(store.databaseName).toBe(dbName);

    const rawDb = await openDB(dbName);
    const saltRecord = (await rawDb.get(META_STORE, 'salt')) as RawMetaRecord | undefined;
    const versionRecord = (await rawDb.get(META_STORE, 'version')) as RawMetaRecord | undefined;
    const sentinelRecord = (await rawDb.get(META_STORE, 'sentinel')) as RawMetaRecord | undefined;

    expect(saltRecord?.value).toBeInstanceOf(Uint8Array);
    expect((saltRecord?.value as Uint8Array | undefined)?.byteLength).toBe(16);
    expect(versionRecord?.value).toBe(1);
    expect(sentinelRecord).toBeUndefined();

    rawDb.close();
  });

  it('open() on an existing DB returns locked and requires unlock()', async () => {
    const firstStore = await EncryptedStore.open(dbName);
    await firstStore.unlock('correct passphrase');
    firstStore.lock();

    const reopenedStore = await EncryptedStore.open(dbName);

    expect(reopenedStore.isUnlocked).toBe(false);
    await expect(reopenedStore.put('resume', 'draft', { id: 1 })).rejects.toBeInstanceOf(
      NotUnlockedError
    );
  });

  it('open() throws if the stored salt metadata is missing', async () => {
    const rawDb = await openDB(dbName, 1, {
      upgrade(database) {
        const metaStore = database.createObjectStore(META_STORE, { keyPath: 'key' });
        metaStore.put({ key: 'version', value: 1 });
        const dataStore = database.createObjectStore(DATA_STORE, { keyPath: 'id' });
        dataStore.createIndex('by-namespace', 'namespace');
        database.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
      },
    });

    rawDb.close();

    await expect(EncryptedStore.open(dbName)).rejects.toThrow(
      'Encrypted store metadata is missing the PBKDF2 salt.'
    );
  });

  it('unlock() with the correct passphrase succeeds', async () => {
    const store = await EncryptedStore.open(dbName);

    await store.unlock('correct passphrase');

    expect(store.isUnlocked).toBe(true);
  });

  it('hasSentinel() reports whether the vault has been initialized with a passphrase', async () => {
    const store = await EncryptedStore.open(dbName);

    await expect(EncryptedStore.hasSentinel(dbName)).resolves.toBe(false);

    await store.unlock('sentinel passphrase');

    await expect(EncryptedStore.hasSentinel(dbName)).resolves.toBe(true);
  });

  it('unlock() with the wrong passphrase throws a clear error', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('correct passphrase');
    store.lock();

    await expect(store.unlock('incorrect passphrase')).rejects.toThrow('Incorrect passphrase.');
  });

  it('unlock() throws if sentinel metadata is structurally invalid', async () => {
    const store = await EncryptedStore.open(dbName);
    const rawDb = await openDB(dbName);

    await rawDb.put(META_STORE, {
      key: 'sentinel',
      value: { nope: true },
    });
    rawDb.close();

    await expect(store.unlock('correct passphrase')).rejects.toThrow(
      'Encrypted store metadata contains an invalid sentinel.'
    );
  });

  it('unlock() throws if the sentinel decrypts but does not match the expected plaintext', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('correct passphrase');
    store.lock();

    const rawDb = await openDB(dbName);
    const saltRecord = (await rawDb.get(META_STORE, 'salt')) as RawMetaRecord;
    const derivedKey = await deriveKey('correct passphrase', saltRecord.value as Uint8Array);
    const wrongSentinel = await encrypt(derivedKey, 'wrong-sentinel');

    await rawDb.put(META_STORE, {
      key: 'sentinel',
      value: wrongSentinel,
    });
    rawDb.close();

    await expect(store.unlock('correct passphrase')).rejects.toThrow('Incorrect passphrase.');
  });

  it('put/get roundtrips various data types', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('roundtrip passphrase');

    await store.put('types', 'string', 'resume text');
    await store.put('types', 'object', { name: 'Ada', years: 5, active: true });
    await store.put('types', 'array', ['a', 2, { nested: true }]);
    await store.put('types', 'number', 42);

    await expect(store.get<string>('types', 'string')).resolves.toBe('resume text');
    await expect(store.get<{ name: string; years: number; active: boolean }>('types', 'object')).resolves.toEqual({
      name: 'Ada',
      years: 5,
      active: true,
    });
    await expect(store.get<Array<unknown>>('types', 'array')).resolves.toEqual([
      'a',
      2,
      { nested: true },
    ]);
    await expect(store.get<number>('types', 'number')).resolves.toBe(42);
  });

  it('get returns undefined for missing keys', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('missing-key passphrase');

    await expect(store.get('resume', 'missing')).resolves.toBeUndefined();
  });

  it('list returns all keys in a namespace', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('listing passphrase');

    await store.put('resume', 'b', { section: 'experience' });
    await store.put('resume', 'a', { section: 'summary' });
    await store.put('resume', 'c', { section: 'education' });

    await expect(store.list('resume')).resolves.toEqual(['a', 'b', 'c']);
  });

  it('different namespaces are isolated', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('isolation passphrase');

    await store.put('resume', 'shared', { source: 'resume' });
    await store.put('settings', 'shared', { source: 'settings' });

    await expect(store.get('resume', 'shared')).resolves.toEqual({ source: 'resume' });
    await expect(store.get('settings', 'shared')).resolves.toEqual({ source: 'settings' });
    await expect(store.list('resume')).resolves.toEqual(['shared']);
    await expect(store.list('settings')).resolves.toEqual(['shared']);
  });

  it('lock() causes subsequent operations to throw NotUnlockedError', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('lock passphrase');
    await store.put('resume', 'draft', { id: 'resume-1' });
    store.lock();

    await expect(store.get('resume', 'draft')).rejects.toBeInstanceOf(NotUnlockedError);
    await expect(store.delete('resume', 'draft')).rejects.toBeInstanceOf(NotUnlockedError);
    await expect(store.list('resume')).rejects.toBeInstanceOf(NotUnlockedError);
    await expect(store.clear('resume')).rejects.toBeInstanceOf(NotUnlockedError);
  });

  it('delete() removes a single key and clear() wipes a namespace', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('mutation passphrase');

    await store.put('resume', 'one', { value: 1 });
    await store.put('resume', 'two', { value: 2 });
    await store.put('settings', 'theme', { dark: false });
    await store.delete('resume', 'one');

    await expect(store.get('resume', 'one')).resolves.toBeUndefined();
    await expect(store.list('resume')).resolves.toEqual(['two']);

    await store.clear('resume');

    await expect(store.list('resume')).resolves.toEqual([]);
    await expect(store.get('settings', 'theme')).resolves.toEqual({ dark: false });
  });

  it('destroy() wipes everything and a new open() acts like first-time init', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('destroy passphrase');
    await store.put('resume', 'draft', { title: 'Security Engineer' });

    await store.destroy();

    const reopenedStore = await EncryptedStore.open(dbName);
    const rawDb = await openDB(dbName);

    expect(reopenedStore.isUnlocked).toBe(false);
    expect(await rawDb.get(DATA_STORE, 'resume\u0000draft')).toBeUndefined();
    expect(await rawDb.get(META_STORE, 'sentinel')).toBeUndefined();
    expect(await rawDb.get(META_STORE, 'salt')).toBeDefined();

    rawDb.close();
  });

  it('concurrent puts do not corrupt data', async () => {
    const store = await EncryptedStore.open(dbName);
    await store.unlock('concurrency passphrase');

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.put('resume', `entry-${index}`, {
          id: index,
          text: `resume-section-${index}`,
        })
      )
    );

    await expect(store.list('resume')).resolves.toEqual([
      'entry-0',
      'entry-1',
      'entry-2',
      'entry-3',
      'entry-4',
      'entry-5',
      'entry-6',
      'entry-7',
      'entry-8',
      'entry-9',
    ]);
    await expect(store.get('resume', 'entry-6')).resolves.toEqual({
      id: 6,
      text: 'resume-section-6',
    });
  });

  it('integrates: stores a resume object, locks, unlocks, and retrieves the identical object', async () => {
    const store = await EncryptedStore.open(dbName);
    const resume = {
      basics: {
        name: 'Casey Applicant',
        email: 'casey@example.com',
      },
      experience: [{ company: 'ShieldCV', title: 'Engineer', years: 3 }],
      skills: ['TypeScript', 'Security', 'IndexedDB'],
    };

    await store.unlock('resume passphrase');
    await store.put('resume', 'profile', resume);
    store.lock();

    await store.unlock('resume passphrase');

    await expect(store.get('resume', 'profile')).resolves.toEqual(resume);
  });

  it('integrates: raw IndexedDB ciphertext does not contain plaintext resume substrings', async () => {
    const store = await EncryptedStore.open(dbName);
    const resume = {
      basics: {
        name: 'Jordan Cipher',
        summary: 'GraphQL platform lead',
      },
      projects: ['ShieldCV Vault', 'Threat Modeler'],
    };

    await store.unlock('ciphertext passphrase');
    await store.put('resume', 'profile', resume);

    const rawDb = await openDB(dbName);
    const rawRecord = (await rawDb.get(DATA_STORE, 'resume\u0000profile')) as RawDataRecord | undefined;

    expect(rawRecord).toBeDefined();
    expect(rawRecord?.bundle.version).toBe(1);

    const recordText = JSON.stringify(rawRecord);
    const ciphertextAsText = Array.from(rawRecord?.bundle.ciphertext ?? [], (value) =>
      String.fromCharCode(value)
    ).join('');

    expect(recordText).not.toContain('Jordan Cipher');
    expect(recordText).not.toContain('GraphQL platform lead');
    expect(recordText).not.toContain('ShieldCV Vault');
    expect(ciphertextAsText).not.toContain('Jordan Cipher');

    rawDb.close();
  });
});
