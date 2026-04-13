/**
 * ShieldCV WebCrypto primitives for local-at-rest encryption and integrity checks.
 *
 * Threat model:
 * - This package protects resume data and audit artifacts that are already inside the
 *   browser or local runtime from offline disclosure, casual inspection, and undetected
 *   tampering when an attacker only gains access to persisted ciphertext.
 * - Confidentiality comes from AES-GCM with a per-message random IV and a passphrase-
 *   derived key generated with PBKDF2-SHA-256 at 600,000 iterations to slow down offline
 *   guessing attacks against weak user passphrases.
 * - Integrity and authenticity of encrypted payloads come from AES-GCM authentication;
 *   decryption is expected to throw if ciphertext or IV bytes are modified or the wrong
 *   key is supplied.
 * - Hashing helpers are intended for integrity workflows such as audit-chain comparison,
 *   not for password storage or signature schemes.
 * - Constant-time hex comparison reduces timing leakage during in-process equality checks,
 *   but it cannot defend against broader side channels introduced by the runtime,
 *   JavaScript engine, or surrounding application code.
 *
 * Limitations:
 * - User passphrase strength is outside this package's control; weak passphrases remain
 *   vulnerable to determined offline guessing despite PBKDF2 hardening.
 * - Derived keys and plaintext necessarily exist in process memory while in use.
 * - This package does not provide secure key escrow, HSM-backed protection, secure UI,
 *   origin isolation, or defense against a fully compromised runtime or malicious script
 *   already executing with access to the same origin.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;
const AES_KEY_LENGTH_BITS = 256;
const BUNDLE_VERSION = 1;

/**
 * Versioned AES-GCM ciphertext bundle for ShieldCV local storage.
 *
 * Threat model:
 * - The version field allows future cryptographic migrations without silently
 *   misinterpreting stored ciphertext under a different algorithm or parameter set.
 * - The salt is intentionally excluded because key-derivation metadata is stored by the
 *   storage layer, which must keep it alongside the protected record metadata.
 */
export interface EncryptedBundle {
  version: 1;
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

function getCrypto(): Crypto {
  if (typeof globalThis.crypto === 'undefined') {
    throw new Error('WebCrypto is unavailable in this runtime.');
  }

  return globalThis.crypto;
}

function toUint8Array(data: string | Uint8Array): Uint8Array {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }

  return data;
}

function toBufferSource(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

function assertBundleVersion(version: number): asserts version is 1 {
  if (version !== BUNDLE_VERSION) {
    throw new Error(`Unsupported encrypted bundle version: ${version}`);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Derives an AES-GCM key from a user passphrase and caller-managed salt.
 *
 * Threat model:
 * - Intended for protecting local ciphertext against offline disclosure when the attacker
 *   can read stored bytes but does not know the user's passphrase.
 * - PBKDF2-SHA-256 with 600,000 iterations deliberately increases the cost of brute-force
 *   guessing, but it cannot compensate for a low-entropy passphrase.
 * - The returned key is non-extractable so application code cannot accidentally serialize
 *   the raw AES key material back into storage.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const crypto = getCrypto();
  const passphraseBytes = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toBufferSource(salt),
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH_BITS,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a new PBKDF2 salt.
 *
 * Threat model:
 * - A unique random salt prevents identical passphrases from deriving identical keys
 *   across different records or users, reducing precomputation and rainbow-table attacks.
 */
export function generateSalt(): Uint8Array {
  return getCrypto().getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
}

/**
 * Generates a new AES-GCM IV.
 *
 * Threat model:
 * - AES-GCM requires a unique IV per encryption under the same key; this helper provides
 *   a random 96-bit nonce so callers do not accidentally reuse IVs via string handling or
 *   manual byte construction.
 */
export function generateIv(): Uint8Array {
  return getCrypto().getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
}

/**
 * Encrypts UTF-8 text or raw bytes using AES-GCM.
 *
 * Threat model:
 * - Protects plaintext confidentiality at rest and adds authentication so tampering is
 *   detected during decryption.
 * - A fresh random IV is generated for every encryption call to avoid catastrophic nonce
 *   reuse under AES-GCM.
 * - The returned bundle is versioned so future algorithm migrations can be handled safely.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string | Uint8Array
): Promise<EncryptedBundle> {
  const iv = generateIv();
  const data = toUint8Array(plaintext);
  const ciphertext = await getCrypto().subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(iv),
    },
    key,
    toBufferSource(data)
  );

  return {
    version: BUNDLE_VERSION,
    ciphertext: new Uint8Array(ciphertext),
    iv,
  };
}

/**
 * Decrypts an encrypted bundle and returns raw bytes.
 *
 * Threat model:
 * - Intended to fail loudly on tampering, IV changes, version mismatches, or use of the
 *   wrong key by relying on AES-GCM authentication and explicit version validation.
 * - Callers should treat thrown errors as security-relevant and avoid suppressing them.
 */
export async function decrypt(
  key: CryptoKey,
  bundle: EncryptedBundle
): Promise<Uint8Array> {
  assertBundleVersion(bundle.version);

  const plaintext = await getCrypto().subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(bundle.iv),
    },
    key,
    toBufferSource(bundle.ciphertext)
  );

  return new Uint8Array(plaintext);
}

/**
 * Decrypts an encrypted bundle and decodes the plaintext as UTF-8 text.
 *
 * Threat model:
 * - Provides the same confidentiality and tamper-detection guarantees as `decrypt`,
 *   while making the final conversion explicit so callers do not accidentally treat raw
 *   binary data as a string through unsafe concatenation.
 */
export async function decryptString(
  key: CryptoKey,
  bundle: EncryptedBundle
): Promise<string> {
  const plaintext = await decrypt(key, bundle);
  return new TextDecoder().decode(plaintext);
}

/**
 * Computes a SHA-256 digest and returns it as lowercase hex.
 *
 * Threat model:
 * - Suitable for integrity checks, hash-chain links, and deterministic content addressing.
 * - Not suitable as a password hashing primitive because SHA-256 alone is fast and offers
 *   no brute-force resistance.
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const digest = await getCrypto().subtle.digest('SHA-256', toBufferSource(toUint8Array(data)));
  return toHex(new Uint8Array(digest));
}

/**
 * Compares two hex strings without exiting early on the first mismatch.
 *
 * Threat model:
 * - Reduces timing leakage during equality checks for fixed-format hash strings used by
 *   the audit chain or integrity metadata.
 * - This is a best-effort JavaScript constant-time comparison; it does not eliminate all
 *   timing side channels from the runtime, garbage collector, or surrounding code.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    const aCode = index < a.length ? a.charCodeAt(index) : 0;
    const bCode = index < b.length ? b.charCodeAt(index) : 0;
    diff |= aCode ^ bCode;
  }

  return diff === 0;
}
