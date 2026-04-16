# ShieldCV

[![CI](https://github.com/WaypointCA/shieldcv/actions/workflows/ci.yml/badge.svg)](https://github.com/WaypointCA/shieldcv/actions/workflows/ci.yml)
[![Security](https://github.com/WaypointCA/shieldcv/actions/workflows/security.yml/badge.svg)](https://github.com/WaypointCA/shieldcv/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

ShieldCV is a local-first, compliance-aware resume security platform. Your resume never leaves your device. The AI runs in your browser. The encryption key derives from your passphrase. Zero external requests. Zero data retention. Zero trust required.

## Hero

ShieldCV is built for students and job seekers who want AI assistance without handing their resume to a cloud service. It combines an encrypted local vault, local AI inference, compliance-aware review tools, and a public security posture that can be inspected directly in the browser.

The application is served from Cloudflare Pages, but the sensitive work happens on the client. Resume content stays in encrypted IndexedDB, models are served from the same origin, and the edge worker delivers static assets and security headers only.

## Why ShieldCV Exists

Most AI resume tools ask users to paste their work history, contact details, academic background, and sometimes clinical or defense-adjacent experience into a remote service. That creates a trust problem immediately. A user has to trust the vendor's storage, logging, model retention, prompt handling, subcontractors, and breach response before they can even ask for feedback on a bullet point.

Universities have started warning students about this exact issue. UC Berkeley's career guidance on generative AI tells students that if they paste a resume into a chat tool for feedback, they should remove their name, email address, phone number, and similar personal details first. That advice is sensible, but it also exposes the product gap. The safest way to protect resume data is not to ask students to manually strip it every time. The safer way is to avoid sending it off-device in the first place. Source: [UC Berkeley Career Center](https://career.berkeley.edu/prepare-for-success/utilizing-generative-ai/).

That gap is surprisingly large. There are many resume builders, many AI writing tools, and many cloud-based review products. There are very few local-first AI resume tools, and even fewer that pair privacy with serious security engineering, compliance-aware scanning, and public documentation of the system's threat model.

ShieldCV fills that gap. It gives users the convenience of AI-assisted resume review while keeping the trust boundary on their own device.

## What It Does

- Local-first resume builder with encrypted vault: create and edit resumes in-browser, then store them in encrypted IndexedDB under a passphrase-derived key.
- HIPAA PHI scanner for healthcare students: detect likely PHI in clinical resume narratives with local AI-assisted entity extraction and compliant rewrite suggestions.
- CMMC CUI detector for defense applicants: flag CUI markings, export-control terms, program names, clearance references, and facility details with lightweight pattern matching.
- GDPR rights tracker with DSAR and erasure templates: track job applications locally and generate Article 15 and Article 17 email templates for common platforms.
- Attack Mode security demonstration: show the app blocking malicious payloads and surfacing protections live for judges and reviewers.
- Hash-chain tamper-evident audit log: record local security events in an append-only chain that can detect tampering.
- Sandboxed PDF import: parse resume PDFs in an isolated iframe with controlled `postMessage` boundaries.

## Security Architecture

- Per-request CSP nonces via Cloudflare Worker: every HTML response gets a fresh nonce so inline script execution is tightly constrained.
- Trusted Types enforcement: the app avoids unsafe HTML sinks and enforces Trusted Types to reduce DOM XSS risk.
- AES-GCM encryption at rest with PBKDF2 600k iterations: resume data is encrypted before it is persisted in IndexedDB.
- Zero external runtime connections: no analytics, no cloud inference API, no third-party runtime calls for resume processing.
- Full security header stack: HSTS, COEP, COOP, CORP, Referrer-Policy, X-Content-Type-Options, and Permissions-Policy are set at the edge.
- OSV-Scanner and Semgrep in CI: dependency and static-analysis checks run in GitHub Actions.
- CycloneDX SBOM generated per build: an SBOM workflow creates a CycloneDX JSON artifact in CI.

## Compliance Artifacts

- [DPIA](./compliance/dpia.md)
- [Application threat model](./compliance/threat-model.md)
- [Data flow diagram](./compliance/data-flow.mermaid)
- [Crypto threat model](./packages/crypto/THREATMODEL.md)
- [SBOM workflow and artifacts](https://github.com/WaypointCA/shieldcv/actions/workflows/sbom.yml)

## Getting Started

```bash
git clone https://github.com/WaypointCA/shieldcv
cd shieldcv
pnpm install
pnpm fetch:models    # downloads ~130 MB AI models (one time)
pnpm --filter web dev
```

## Architecture

ShieldCV is a monorepo with small packages that separate high-risk responsibilities:

- `packages/crypto`: WebCrypto helpers for encryption, decryption, hashing, and key derivation
- `packages/storage`: encrypted IndexedDB abstraction
- `packages/ai`: local AI model loading and inference hooks
- `packages/compliance`: HIPAA, CMMC, and GDPR modules
- `packages/audit`: tamper-evident local audit chain
- `packages/resume`: normalized resume schema and helpers
- `apps/web`: SvelteKit application for Cloudflare Pages

Tech stack:

- SvelteKit 5
- TypeScript
- Vite 6
- Transformers.js
- WebCrypto API
- IndexedDB
- Cloudflare Pages

## Built for the Handshake x OpenAI Codex Creator Challenge

ShieldCV was built for the [Handshake x OpenAI Codex Creator Challenge](https://joinhandshake.com/) as a privacy-first answer to a real job-search problem. The project was developed with OpenAI Codex as a coding collaborator and documents its security and compliance posture openly so judges and employers can inspect the engineering choices directly.

## About

ShieldCV is created by [Waypoint Compliance Advisory](https://waypointca.com/). For questions, collaboration, or product interest, contact [hello@shieldcv.app](mailto:hello@shieldcv.app).

## License

MIT
