# ShieldCV Application Threat Model

This document extends the crypto-specific analysis in [packages/crypto/THREATMODEL.md](../packages/crypto/THREATMODEL.md) to cover the full ShieldCV application. It uses STRIDE to describe major risks across the application's trust boundaries and highlights the architectural choices that reduce privacy and security exposure.

Related diagram: [compliance/data-flow.mermaid](./data-flow.mermaid)

## 1. Scope

This threat model covers:

- The SvelteKit web application
- Local encrypted IndexedDB storage
- The audit logging subsystem
- The local AI inference path
- The sandboxed PDF import flow
- The Cloudflare Worker and Pages delivery path

It does not claim to defend against a compromised browser, compromised operating system, malicious browser extensions, or physical access to an already unlocked device.

## 2. Asset Inventory

### Resume data

The highest-value asset in the system is user resume content, including names, contact details, employment history, education history, certifications, project descriptions, and compliance-sensitive narrative text.

### Encryption keys

ShieldCV derives encryption keys from a user passphrase with PBKDF2-SHA-256 and uses those keys to protect local data at rest. These keys are especially sensitive while resident in process memory during an unlocked session.

### Audit log

The audit log records security-relevant events and uses a hash-chain design to make tampering detectable. Integrity matters more than secrecy for some entries, but confidentiality still matters because the log may reveal local activity patterns.

### AI models

Local model files are a supply-chain-sensitive asset because tampered model artifacts or loader code could change application behavior or enable exfiltration if other controls failed.

### Application source code

The application codebase, bundled client assets, worker code, and deployment configuration are security-critical because they enforce CSP, Trusted Types, storage encryption, sandbox boundaries, and same-origin behavior.

## 3. Trust Boundaries

### Browser tab

The browser tab is the primary application context where the user edits resumes, unlocks the vault, reviews findings, and initiates processing. It is the main holder of plaintext data after decryption.

### Service worker

The service worker supports offline behavior and same-origin caching. It is trusted to cache the application shell without introducing unauthorized network behavior or cache poisoning side effects.

### Web Worker for AI inference

The AI inference worker is a separate execution context used to run local model loading and processing. It receives text from the browser tab but remains within the same local device boundary.

### Sandboxed iframe for PDF parsing

PDF parsing occurs in a sandboxed iframe that communicates with the main UI via `postMessage`. This isolates PDF parsing logic from the primary page context and narrows the blast radius of malformed or malicious documents.

### Cloudflare Worker

The Cloudflare Worker sits on the network boundary and serves static assets while injecting security headers and per-request CSP nonces. It does not receive user resume data and should be treated as a delivery boundary rather than a data-processing boundary.

## 4. STRIDE Analysis

### 4.1 Browser tab

| STRIDE | Threat | Relevance | Mitigations |
| --- | --- | --- | --- |
| Spoofing | Account spoofing or user impersonation | Low | ShieldCV has no multi-user account model and no server-side authentication surface to spoof. |
| Tampering | Malicious script alters decrypted resume content or UI state | Medium | CSP nonces, Trusted Types, strict dependency controls, and same-origin runtime behavior reduce script injection risk. |
| Repudiation | User cannot tell whether security-sensitive local actions occurred | Medium | Local append-only audit log with hash chaining makes tampering detectable. |
| Information Disclosure | Plaintext visible in DOM or memory while unlocked | High | Encryption at rest protects storage, but unlocked-session exposure remains a known limitation. |
| Denial of Service | Oversized input or repeated local processing causes hangs | Medium | `MAX_RESUME_SIZE` guard limits resume size, and local-only design removes server DoS exposure. |
| Elevation of Privilege | App code gains privileged access | Low | There is no internal privilege model beyond the single-user local session. |

### 4.2 Service worker

| STRIDE | Threat | Relevance | Mitigations |
| --- | --- | --- | --- |
| Spoofing | Fake worker controls cached assets | Low | Same-origin registration and HTTPS reduce spoofing opportunities. |
| Tampering | Cache poisoning or altered offline assets | Medium | Same-origin delivery, strict build outputs, and deployment controls reduce poisoning risk. |
| Repudiation | Cache-originated behavior is hard to reason about | Low | Static asset model and deterministic builds simplify verification. |
| Information Disclosure | Cached assets leak sensitive runtime data | Low | Resume data is not stored in the service worker cache path. |
| Denial of Service | Corrupt cache prevents app startup | Medium | User can clear site data; no server outage is required to trigger app unavailability. |
| Elevation of Privilege | Worker executes broader privileged actions | Low | Browser-managed worker permissions constrain behavior to origin-scoped capabilities. |

### 4.3 Web Worker for AI inference

| STRIDE | Threat | Relevance | Mitigations |
| --- | --- | --- | --- |
| Spoofing | Worker receives unexpected messages | Low | Internal message flow is same-origin and application-controlled. |
| Tampering | Worker output is manipulated or model files are altered | Medium | Same-origin model delivery, CI scanning, lockfile discipline, and SBOM generation reduce supply-chain risk. |
| Repudiation | AI-generated findings cannot be traced to local execution | Low | Processing is local and user initiated; audit logging can record scan completion. |
| Information Disclosure | Resume text leaves the device during inference | Low | Models run locally and no external inference API is called. |
| Denial of Service | Large model loads or repeated inference degrade UX | Medium | Build-time model fetch and local worker isolation limit impact to the client session. |
| Elevation of Privilege | Worker escapes intended scope | Low | Browser worker isolation constrains direct DOM access. |

### 4.4 Sandboxed iframe for PDF parsing

| STRIDE | Threat | Relevance | Mitigations |
| --- | --- | --- | --- |
| Spoofing | Untrusted content impersonates the parser channel | Low | Explicit `postMessage` workflow and sandboxing narrow communication paths. |
| Tampering | Malformed PDF attempts to alter application state | Medium | The parser runs in a sandboxed iframe rather than the main UI context. |
| Repudiation | Import outcomes are hard to verify | Low | Import actions can be reflected in audit logging and UI status. |
| Information Disclosure | PDF parsing leaks local content to a remote endpoint | Low | Parsing occurs locally and inside the same origin. |
| Denial of Service | Malformed or oversized PDF consumes resources | Medium | Sandboxing and bounded import flow reduce impact to the current session. |
| Elevation of Privilege | PDF script reaches privileged UI context | Low | Sandboxed iframe and message passing reduce cross-context capability. |

### 4.5 Cloudflare Worker boundary

| STRIDE | Threat | Relevance | Mitigations |
| --- | --- | --- | --- |
| Spoofing | Origin spoofing or hostile intermediary | Low | HTTPS, HSTS, and Cloudflare-managed TLS reduce risk. |
| Tampering | Security headers or static assets are modified in transit | Medium | TLS, same-origin serving, and deployment controls mitigate modification risk. |
| Repudiation | Hard to prove what headers were delivered | Low | Browser DevTools can inspect responses and CSP behavior directly. |
| Information Disclosure | Edge receives resume data | Low | The application never sends resume content back across the network boundary. |
| Denial of Service | Public site unavailable | Medium | Standard CDN and edge availability concerns remain, but there is no server-side data store to attack. |
| Elevation of Privilege | Worker gains access to user vault data | Low | No network path exists for vault contents during normal use. |

## 5. STRIDE Summary by Theme

### Spoofing

Spoofing risk is comparatively low because ShieldCV has no remote account system, no server-side authentication layer, and no multi-user privilege boundary. The main remaining spoofing concern is supply-chain or origin spoofing, which is mitigated by HTTPS and same-origin deployment.

### Tampering

Tampering risk is materially reduced by:

- AES-GCM integrity protection for encrypted records
- Hash-chain audit logging
- Strict CSP with per-request nonces
- Trusted Types enforcement
- Sandboxed PDF parsing

### Repudiation

Repudiation is addressed locally through the append-only audit log, which allows tamper detection for security-relevant events such as vault lifecycle transitions and compliance scan actions.

### Information disclosure

Information disclosure is the primary concern for any resume product. ShieldCV addresses it through:

- Encryption at rest in IndexedDB
- No server-side resume storage
- No external runtime connections
- Same-origin model serving
- CSP, Trusted Types, COEP, COOP, and CORP protections

### Denial of service

ShieldCV cannot eliminate local denial of service caused by malformed files, browser instability, or endpoint resource exhaustion. It reduces the risk with bounded input sizes, local isolation boundaries, and the fact that there is no central data service to attack.

### Elevation of privilege

Elevation of privilege is limited because ShieldCV is a single-user local application with no administrative control plane. The more realistic concern is hostile code execution in the same origin or a compromised browser environment, which is addressed only partially by CSP and Trusted Types.

## 6. Known Limitations

ShieldCV documents the following limits explicitly:

- JavaScript memory is not securely erasable in a general browser runtime
- Browser extensions can read DOM content in an unlocked session
- A compromised operating system can defeat browser-layer protections
- Passphrase strength is user-dependent
- Physical access to an already unlocked device remains dangerous

These are residual risks that cannot be fully solved by an in-browser application.

## 7. Conclusion

ShieldCV's threat posture is strongest where architecture can replace trust. There is no server-side resume database to breach, no external inference API to inspect prompts, and no multi-tenant cloud store holding user content. The highest residual risks are endpoint-local: unlocked session exposure, weak passphrases, compromised browsers, and software supply-chain compromise.

Within those limits, ShieldCV applies layered mitigations across each trust boundary and provides transparent artifacts for public review.
