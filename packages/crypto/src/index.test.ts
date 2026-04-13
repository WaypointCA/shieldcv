import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  constantTimeEqual,
  decrypt,
  decryptString,
  deriveKey,
  encrypt,
  generateIv,
  generateSalt,
  sha256Hex,
  type EncryptedBundle,
} from './index';

const textEncoder = new TextEncoder();
const fixedIv = new Uint8Array(12);

async function encryptWithFixedIv(key: CryptoKey, plaintext: string): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: fixedIv,
    },
    key,
    new Uint8Array(textEncoder.encode(plaintext))
  );

  return new Uint8Array(ciphertext);
}

describe('@shieldcv/crypto', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deriveKey is deterministic for the same passphrase and salt', async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const firstKey = await deriveKey('correct horse battery staple', salt);
    const secondKey = await deriveKey('correct horse battery staple', salt);

    const [firstCiphertext, secondCiphertext] = await Promise.all([
      encryptWithFixedIv(firstKey, 'ShieldCV deterministic key test'),
      encryptWithFixedIv(secondKey, 'ShieldCV deterministic key test'),
    ]);

    expect(firstCiphertext).toEqual(secondCiphertext);
  });

  it('deriveKey produces different keys for different salts', async () => {
    const firstKey = await deriveKey(
      'correct horse battery staple',
      Uint8Array.from({ length: 16 }, (_, index) => index)
    );
    const secondKey = await deriveKey(
      'correct horse battery staple',
      Uint8Array.from({ length: 16 }, (_, index) => index + 1)
    );

    const [firstCiphertext, secondCiphertext] = await Promise.all([
      encryptWithFixedIv(firstKey, 'ShieldCV salt separation test'),
      encryptWithFixedIv(secondKey, 'ShieldCV salt separation test'),
    ]);

    expect(firstCiphertext).not.toEqual(secondCiphertext);
  });

  it('encrypt then decrypt roundtrips plaintext', async () => {
    const key = await deriveKey('roundtrip-passphrase', generateSalt());
    const bundle = await encrypt(key, 'local-first resume data');

    expect(bundle.version).toBe(1);
    expect(bundle.iv).toHaveLength(12);

    const plaintext = await decryptString(key, bundle);

    expect(plaintext).toBe('local-first resume data');
  });

  it('decrypt fails loudly if ciphertext is tampered with', async () => {
    const key = await deriveKey('tamper-passphrase', generateSalt());
    const bundle = await encrypt(key, 'tamper resistant content');
    const tamperedBundle: EncryptedBundle = {
      ...bundle,
      ciphertext: bundle.ciphertext.slice(),
    };

    tamperedBundle.ciphertext[0] ^= 0xff;

    await expect(decrypt(key, tamperedBundle)).rejects.toThrow();
  });

  it('decrypt fails loudly if IV is tampered with', async () => {
    const key = await deriveKey('iv-passphrase', generateSalt());
    const bundle = await encrypt(key, 'integrity checked iv');
    const tamperedBundle: EncryptedBundle = {
      ...bundle,
      iv: bundle.iv.slice(),
    };

    tamperedBundle.iv[0] ^= 0xff;

    await expect(decrypt(key, tamperedBundle)).rejects.toThrow();
  });

  it('decrypt fails loudly if the wrong key is used', async () => {
    const salt = generateSalt();
    const correctKey = await deriveKey('correct-passphrase', salt);
    const wrongKey = await deriveKey('wrong-passphrase', salt);
    const bundle = await encrypt(correctKey, 'wrong key detection');

    await expect(decrypt(wrongKey, bundle)).rejects.toThrow();
  });

  it('sha256Hex matches known test vectors', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    await expect(sha256Hex(Uint8Array.from([0x00, 0x01, 0x02, 0xff]))).resolves.toBe(
      '3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56'
    );
  });

  it('constantTimeEqual returns true for equal values and false for unequal values', () => {
    expect(constantTimeEqual('deadbeef', 'deadbeef')).toBe(true);
    expect(constantTimeEqual('deadbeef', 'deadbeee')).toBe(false);
    expect(constantTimeEqual('deadbeef', 'deadbeef00')).toBe(false);
    expect(constantTimeEqual('deadbeef00', 'deadbeef')).toBe(false);
  });

  it('constantTimeEqual takes approximately constant time for basic comparisons', () => {
    const iterations = 200_000;
    const equalA = 'a'.repeat(64);
    const equalB = 'a'.repeat(64);
    const mismatchEarly = `b${'a'.repeat(63)}`;
    const mismatchLate = `${'a'.repeat(63)}b`;

    const measure = (left: string, right: string): number => {
      const start = performance.now();

      for (let index = 0; index < iterations; index += 1) {
        constantTimeEqual(left, right);
      }

      return performance.now() - start;
    };

    const earlyDuration = measure(equalA, mismatchEarly);
    const lateDuration = measure(equalA, mismatchLate);
    const equalDuration = measure(equalA, equalB);
    const durations = [earlyDuration, lateDuration, equalDuration];
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    expect(maxDuration / minDuration).toBeLessThan(1.5);
  });

  it('uses exactly 600000 PBKDF2 iterations', async () => {
    const deriveKeySpy = vi.spyOn(crypto.subtle, 'deriveKey');

    await deriveKey('iteration-check', generateSalt());

    expect(deriveKeySpy).toHaveBeenCalledTimes(1);
    expect(deriveKeySpy.mock.calls[0]?.[0]).toMatchObject({
      hash: 'SHA-256',
      iterations: 600_000,
      name: 'PBKDF2',
    });
  });

  it('generates salt and iv with the expected byte lengths', () => {
    expect(generateSalt()).toHaveLength(16);
    expect(generateIv()).toHaveLength(12);
  });

  it('rejects unsupported bundle versions', async () => {
    const key = await deriveKey('version-passphrase', generateSalt());
    const bundle = await encrypt(key, 'versioning matters');

    await expect(
      decrypt(key, {
        ...bundle,
        version: 2 as 1,
      })
    ).rejects.toThrow('Unsupported encrypted bundle version: 2');
  });

  it('fails loudly when WebCrypto is unavailable', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    try {
      expect(() => generateSalt()).toThrow('WebCrypto is unavailable in this runtime.');
      await expect(sha256Hex('abc')).rejects.toThrow('WebCrypto is unavailable in this runtime.');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      }
    }
  });
});
