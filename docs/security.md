# ShieldCV Security

ShieldCV is built around a simple promise: your resume should not have to leave your device just to receive AI assistance. This page explains the security principles behind that promise, the technical controls used to enforce it, and how you can verify those claims yourself in the browser.

## The Seven Core Security Principles

## 1. Your data stays with you

ShieldCV is local-first. Resume drafts, audit records, scan results, and GDPR tracker entries are stored in the browser, not in a cloud database.

How it is enforced:

- Resume and tracker records are persisted in IndexedDB only
- The Cloudflare Worker serves static assets and security headers only
- No runtime endpoint accepts resume uploads

How to verify:

- Open DevTools Network
- Use the app normally
- Confirm there are no POST requests carrying resume content
- Inspect response headers from `shieldcv.app` and confirm the site is served from a single origin

## 2. The app should work offline

ShieldCV is packaged as a Progressive Web App so the application shell can continue to load after the first visit.

How it is enforced:

- Service worker registration for offline support
- Same-origin static asset serving
- Local model delivery after build-time fetch

How to verify:

- Open DevTools Application tab
- Inspect Service Workers and Cache Storage
- Load the app once, then switch the browser to Offline mode
- Refresh and confirm the shell still loads

## 3. Sensitive records should be encrypted at rest

When ShieldCV stores resume content locally, it encrypts it before persistence.

How it is enforced:

- AES-GCM encryption for stored records
- PBKDF2-SHA-256 key derivation with 600,000 iterations
- Per-vault salt and explicit vault unlock flow
- Lock state clears the in-memory working key reference used by the encrypted store

How to verify:

- Open DevTools Application tab and inspect IndexedDB
- Confirm stored records are ciphertext bundles rather than readable resume JSON
- Review the implementation in [packages/crypto](../packages/crypto/THREATMODEL.md) and [packages/storage](../packages/storage)

## 4. There should be no surprise server contact

ShieldCV avoids external runtime connections during normal use.

How it is enforced:

- AI models are fetched at build time, then served from the same origin
- No analytics SDKs are embedded
- No external inference APIs are called during scans
- GDPR templates are generated locally and copied to the clipboard instead of being sent

How to verify:

- Open DevTools Network
- Filter by third-party domains
- Use the resume builder, scanners, and GDPR tracker
- Confirm requests stay on `shieldcv.app`

## 5. Security should use layers, not one trick

ShieldCV combines browser-native controls with local-first design so a single failure does not become a full compromise.

How it is enforced:

- Per-request CSP nonces from the Cloudflare Worker
- Trusted Types enforcement
- HSTS
- COEP, COOP, and CORP for cross-origin isolation and policy tightening
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- Sandboxed PDF parsing in an iframe

How to verify:

- Open DevTools Network and inspect the response headers for `/`
- Confirm the CSP contains a nonce and strict script policy
- Open DevTools Console and verify there are no CSP or Trusted Types violations during normal use
- Visit Attack Mode and observe blocked payloads in the live demo

## 6. You deserve an audit trail

ShieldCV records security-relevant local events in a tamper-evident chain.

How it is enforced:

- Audit entries are chained with SHA-256 hashes
- Each entry references the previous entry hash
- Integrity verification detects modified or reordered entries
- Audit data stays in the encrypted local vault

How to verify:

- Use the vault, scans, and tracker features
- Open the audit view in the app
- Review event chronology and integrity status
- Inspect the audit package in [packages/audit](../packages/audit)

## 7. Explanations should be understandable

ShieldCV documents its security posture publicly so users, judges, and reviewers can inspect claims instead of trusting marketing copy.

How it is enforced:

- Public security page in the app
- Public compliance artifacts in the repository
- Public threat models and deployment documentation
- Reproducible CI checks for lint, typecheck, tests, security scanning, and SBOM generation

How to verify:

- Review the documents linked below
- Inspect GitHub Actions workflows in `.github/workflows`
- Compare the docs with runtime behavior in DevTools

## Compliance and Security Artifacts

- [DPIA](../compliance/dpia.md)
- [Application threat model](../compliance/threat-model.md)
- [Data flow diagram](../compliance/data-flow.mermaid)
- [Crypto threat model](../packages/crypto/THREATMODEL.md)
- [Deployment documentation](./deployment.md)

## Responsible Disclosure

Please report security issues to [security@shieldcv.app](mailto:security@shieldcv.app).

Best effort response time is within 72 hours.

## Live Demonstration

To see the protections working in real time, visit the app's Attack Mode and try the included malicious payloads. It is the quickest way to observe CSP, Trusted Types, sanitization boundaries, and local-only storage behavior without reading the source first.
