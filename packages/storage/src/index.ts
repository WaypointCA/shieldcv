import { decrypt, decryptString, deriveKey, encrypt, generateSalt, type EncryptedBundle } from '@shieldcv/crypto';
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DATABASE_VERSION = 1;
const META_STORE = 'meta';
const DATA_STORE = 'data';
const AUDIT_STORE = 'audit';
const META_SALT_KEY = 'salt';
const META_SENTINEL_KEY = 'sentinel';
const META_VERSION_KEY = 'version';
const SENTINEL_PLAINTEXT = 'shieldcv-v1-ok';

type MetaKey = typeof META_SALT_KEY | typeof META_SENTINEL_KEY | typeof META_VERSION_KEY;

interface MetaRecord {
  key: MetaKey;
  value: Uint8Array | EncryptedBundle | number;
}

interface DataRecord {
  id: string;
  namespace: string;
  key: string;
  bundle: EncryptedBundle;
}

interface AuditRecord {
  id?: number;
  event: unknown;
}

interface StorageDatabase extends DBSchema {
  meta: {
    key: MetaKey;
    value: MetaRecord;
  };
  data: {
    key: string;
    value: DataRecord;
    indexes: {
      'by-namespace': string;
    };
  };
  audit: {
    key: number;
    value: AuditRecord;
  };
}

/**
 * Thrown when a caller attempts to access encrypted data before unlocking the store.
 */
export class NotUnlockedError extends Error {
  constructor() {
    super('Encrypted store is locked. Call unlock(passphrase) before accessing data.');
    this.name = 'NotUnlockedError';
  }
}

function composeDataId(namespace: string, key: string): string {
  return `${namespace}\u0000${key}`;
}

function zeroBytes(bytes: Uint8Array | null): void {
  if (bytes !== null) {
    bytes.fill(0);
  }
}

function upgradeStorageDatabase(database: IDBPDatabase<StorageDatabase>): void {
  if (!database.objectStoreNames.contains(META_STORE)) {
    const metaStore = database.createObjectStore(META_STORE, { keyPath: 'key' });
    metaStore.put({ key: META_SALT_KEY, value: generateSalt() });
    metaStore.put({ key: META_VERSION_KEY, value: DATABASE_VERSION });
  }

  if (!database.objectStoreNames.contains(DATA_STORE)) {
    const dataStore = database.createObjectStore(DATA_STORE, { keyPath: 'id' });
    dataStore.createIndex('by-namespace', 'namespace');
  }

  if (!database.objectStoreNames.contains(AUDIT_STORE)) {
    database.createObjectStore(AUDIT_STORE, { keyPath: 'id', autoIncrement: true });
  }
}

/**
 * Encrypted IndexedDB wrapper for ShieldCV local storage.
 */
export class EncryptedStore {
  #db: IDBPDatabase<StorageDatabase>;
  #salt: Uint8Array;
  #key: CryptoKey | null = null;
  #bestEffortWipe: Uint8Array | null = null;
  #dbName: string;

  private constructor(db: IDBPDatabase<StorageDatabase>, salt: Uint8Array, dbName: string) {
    this.#db = db;
    this.#salt = salt;
    this.#dbName = dbName;
  }

  /**
   * Opens or creates the encrypted IndexedDB database and initializes metadata on first use.
   */
  static async open(dbName: string): Promise<EncryptedStore> {
    const db = await openDB<StorageDatabase>(dbName, DATABASE_VERSION, {
      upgrade: upgradeStorageDatabase,
    });

    const saltRecord = await db.get(META_STORE, META_SALT_KEY);

    if (!(saltRecord?.value instanceof Uint8Array)) {
      throw new Error('Encrypted store metadata is missing the PBKDF2 salt.');
    }

    return new EncryptedStore(db, new Uint8Array(saltRecord.value), dbName);
  }

  /**
   * Reports whether a database already contains the passphrase sentinel for an existing vault.
   */
  static async hasSentinel(dbName: string): Promise<boolean> {
    const db = await openDB<StorageDatabase>(dbName, DATABASE_VERSION, {
      upgrade: upgradeStorageDatabase,
    });

    try {
      return (await db.get(META_STORE, META_SENTINEL_KEY)) !== undefined;
    } finally {
      db.close();
    }
  }

  /**
   * Closes and deletes an encrypted database.
   */
  static async destroy(dbName: string): Promise<void> {
    await deleteDB(dbName);
  }

  /**
   * Derives the encryption key from the user passphrase and verifies it with the sentinel.
   */
  async unlock(passphrase: string): Promise<void> {
    const passphraseCopy = new TextEncoder().encode(passphrase);

    try {
      const derivedKey = await deriveKey(passphrase, this.#salt);
      const sentinelRecord = await this.#db.get(META_STORE, META_SENTINEL_KEY);

      if (sentinelRecord === undefined) {
        const sentinelBundle = await encrypt(derivedKey, SENTINEL_PLAINTEXT);
        await this.#db.put(META_STORE, {
          key: META_SENTINEL_KEY,
          value: sentinelBundle,
        });
        this.#key = derivedKey;
        this.#bestEffortWipe = passphraseCopy;
        return;
      }

      const sentinelValue = sentinelRecord.value;

      if (
        typeof sentinelValue !== 'object' ||
        sentinelValue === null ||
        !('ciphertext' in sentinelValue) ||
        !('iv' in sentinelValue) ||
        !('version' in sentinelValue)
      ) {
        throw new Error('Encrypted store metadata contains an invalid sentinel.');
      }

      try {
        const sentinelPlaintext = await decryptString(derivedKey, sentinelValue as EncryptedBundle);

        if (sentinelPlaintext !== SENTINEL_PLAINTEXT) {
          throw new Error('Incorrect passphrase.');
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Incorrect passphrase.') {
          throw error;
        }

        throw new Error('Incorrect passphrase.');
      }

      this.#key = derivedKey;
      this.#bestEffortWipe = passphraseCopy;
    } finally {
      zeroBytes(passphraseCopy);
    }
  }

  /**
   * Indicates whether the store currently has a usable derived key in memory.
   */
  get isUnlocked(): boolean {
    return this.#key !== null;
  }

  /**
   * Locks the store by dropping the in-memory key and scrubbing best-effort byte buffers.
   */
  lock(): void {
    this.#key = null;
    zeroBytes(this.#bestEffortWipe);
    this.#bestEffortWipe = null;
  }

  /**
   * Closes the database connection and drops in-memory key material.
   */
  close(): void {
    this.lock();
    this.#db.close();
  }

  /**
   * Closes and deletes this encrypted database instance.
   */
  async destroy(): Promise<void> {
    this.close();
    await EncryptedStore.destroy(this.#dbName);
  }

  /**
   * Encrypts and stores a JSON-serializable value within a namespace.
   */
  async put<T>(namespace: string, key: string, value: T): Promise<void> {
    const cryptoKey = this.#requireUnlocked();
    const serialized = JSON.stringify(value);
    const plaintextBytes = new TextEncoder().encode(serialized);

    try {
      const bundle = await encrypt(cryptoKey, plaintextBytes);

      await this.#db.put(DATA_STORE, {
        id: composeDataId(namespace, key),
        namespace,
        key,
        bundle,
      });
    } finally {
      zeroBytes(plaintextBytes);
    }
  }

  /**
   * Retrieves, decrypts, and deserializes a stored JSON value.
   */
  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const cryptoKey = this.#requireUnlocked();
    const record = await this.#db.get(DATA_STORE, composeDataId(namespace, key));

    if (record === undefined) {
      return undefined;
    }

    const plaintextBytes = await decrypt(cryptoKey, record.bundle);

    try {
      return JSON.parse(new TextDecoder().decode(plaintextBytes)) as T;
    } finally {
      zeroBytes(plaintextBytes);
    }
  }

  /**
   * Deletes a single encrypted value from a namespace.
   */
  async delete(namespace: string, key: string): Promise<void> {
    this.#requireUnlocked();
    await this.#db.delete(DATA_STORE, composeDataId(namespace, key));
  }

  /**
   * Lists all keys stored within a namespace.
   */
  async list(namespace: string): Promise<string[]> {
    this.#requireUnlocked();
    const records = await this.#db.getAllFromIndex(DATA_STORE, 'by-namespace', namespace);
    return records.map((record) => record.key).sort();
  }

  /**
   * Removes every record within a namespace.
   */
  async clear(namespace: string): Promise<void> {
    this.#requireUnlocked();

    const transaction = this.#db.transaction(DATA_STORE, 'readwrite');
    let cursor = await transaction.store.index('by-namespace').openCursor(namespace);

    while (cursor !== null) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await transaction.done;
  }

  get databaseName(): string {
    return this.#dbName;
  }

  #requireUnlocked(): CryptoKey {
    if (this.#key === null) {
      throw new NotUnlockedError();
    }

    return this.#key;
  }
}
