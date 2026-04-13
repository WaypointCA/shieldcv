# ShieldCV Crypto Package Threat Model

`@shieldcv/crypto` provides the primitive cryptographic building blocks used to encrypt ShieldCV records at rest, detect tampering, and hash integrity data for append-only audit workflows.

## Assets Protected

- Resume content, notes, and derived structured data before they are persisted locally.
- Ciphertext integrity for encrypted local records.
- Audit-chain hash values and other integrity metadata derived through SHA-256.
- User passphrase-derived encryption keys, while resident in process memory.

## Threat Actors Considered

- An attacker with offline access to browser storage, device backups, or exported application data.
- A local attacker attempting to modify ciphertext, IVs, or integrity metadata without detection.
- An attacker attempting passphrase guessing against captured ciphertext and stored salts.
- A benign but buggy caller that might misuse binary data handling, reuse IVs, or ignore migration/version boundaries.

## STRIDE Mapping

| Category | Relevance | Mitigation in `@shieldcv/crypto` |
| --- | --- | --- |
| Spoofing | Limited | AES-GCM authentication helps detect unauthorized modification when the attacker lacks the correct key, but this package does not authenticate user identity. |
| Tampering | High | AES-GCM decryption fails on modified ciphertext or IVs, and encrypted bundles are versioned to prevent silent algorithm confusion. |
| Repudiation | Medium | SHA-256 helpers support higher-level audit-chain designs, but repudiation controls depend on surrounding storage and logging packages. |
| Information Disclosure | High | AES-GCM protects ciphertext confidentiality and PBKDF2-SHA-256 with 600,000 iterations raises the cost of offline passphrase guessing. |
| Denial of Service | Medium | Attackers can still corrupt or delete stored blobs, causing decryption failure or data loss; this package detects tampering but cannot guarantee availability. |
| Elevation of Privilege | Limited | This package does not manage privileges or sandboxing; a compromised runtime with access to the same origin can use keys already in memory. |

## Limitations

- Keys and plaintext exist in application memory while in use; this package does not provide HSM, enclave, or hardware-backed isolation.
- PBKDF2 slows brute-force attacks but cannot make weak passphrases strong.
- The package does not store salts or key-derivation metadata; callers must persist them correctly and consistently.
- The package does not protect against malicious JavaScript already running in the same origin or a fully compromised browser/runtime.
- Constant-time comparison is best-effort in JavaScript and cannot eliminate all timing side channels from the engine or host environment.
