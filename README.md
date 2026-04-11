# ShieldCV

ShieldCV is a local-first, mobile-first resume security platform designed to protect sensitive resume data without sending content off-device. The app is built as a static SvelteKit PWA and uses workspace packages for crypto, storage, audit, AI, and compliance concerns.

## Quickstart

1. Use Node.js 20 LTS.
2. Enable Corepack if needed with `corepack enable`.
3. Install dependencies with `pnpm install`.
4. Start the web app with `pnpm --filter web dev`.
5. Run checks with `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
6. Create a production build with `pnpm --filter web build`.

## Security Principles

- Zero data retention. Resume content, PII, and derived data stay on the user's device.
- Local-first AI. All model execution runs in-browser or through the user's own local Ollama instance.
- Encrypted at rest. IndexedDB content is encrypted with AES-GCM using PBKDF2-derived keys.
- Defense in depth. The web app ships with strict browser security headers and an offline-first PWA posture.
- Auditability. Security-relevant events are tracked in an append-only encrypted audit log.

## Workspace Layout

- `apps/web`: Static SvelteKit PWA for Cloudflare Pages.
- `packages/crypto`: WebCrypto helpers.
- `packages/storage`: Encrypted IndexedDB abstractions.
- `packages/ai`: Local inference integration points.
- `packages/compliance`: Compliance scan utilities.
- `packages/audit`: Hash-chain audit log helpers.
- `compliance`: DPIA, threat model, data flow, and SBOM artifacts.
