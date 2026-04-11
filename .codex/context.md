PROJECT CONTEXT (read first, always apply)

You are building ShieldCV, a local-first, mobile-first, privacy-preserving
resume security platform. Core principles that must NEVER be violated:

1. ZERO DATA RETENTION. No resume content, PII, or derived data ever leaves
   the user's device. No telemetry, no analytics, no error reporting that
   includes user content, no third-party script tags.

2. LOCAL-FIRST AI. All AI processing runs in-browser via Transformers.js
   with quantized models, or optionally via the user's own Ollama instance
   detected on desktop. Never call external LLM APIs from the app.

3. ENCRYPTED AT REST. All user data in IndexedDB is encrypted with AES-GCM
   using a key derived from the user's passphrase via PBKDF2 (600k
   iterations minimum, SHA-256).

4. MOBILE-FIRST. Design for iPhone and Android viewports first, then scale
   up to desktop. The PWA must be installable and work fully offline after
   first load.

5. DEFENSE IN DEPTH. Strict Content Security Policy with nonces, Trusted
   Types enforcement, SRI on all external resources, sandboxed iframes for
   any untrusted content (PDF rendering especially), Permissions Policy
   denying camera/mic/geolocation/payment/usb.

6. AUDITABILITY. Every security-relevant event is logged to a hash-chain
   append-only audit log stored encrypted in IndexedDB. The log is
   visible in-app and exportable.

7. COMPLIANCE ARTIFACTS. The repo ships with DPIA, threat model, data flow
   diagram, and signed SBOM (CycloneDX) as first-class deliverables.

STACK (locked)
- SvelteKit 2 + TypeScript + Vite 5
- pnpm workspaces (monorepo)
- vite-plugin-pwa for the service worker and manifest
- Transformers.js for in-browser NER and embeddings
- WebCrypto API (no third-party crypto libraries)
- IndexedDB via idb wrapper (https://github.com/jakearchibald/idb)
- pdf.js in a sandboxed iframe for PDF import
- DOMPurify for HTML sanitization
- Tailwind CSS v4 for styling with mobile-first breakpoints
- Vitest for unit tests, Playwright for e2e
- GitHub Actions for CI with Semgrep, OSV-Scanner, cdxgen, ZAP baseline

DEPLOY
- Cloudflare Pages (free tier)
- Custom domain via Cloudflare DNS
- HTTP security headers via _headers file
- No backend, no API routes that persist data

NON-GOALS (do not build these)
- User accounts, authentication against any server, password reset flows
- Analytics, telemetry, crash reporting, error tracking
- Cloud storage sync (maybe post-challenge, not now)
- Native mobile apps (PWA only for the challenge)
- Any feature that requires a server

CODING STANDARDS
- Strict TypeScript, no any except where explicitly justified in comment
- No em dashes in any user-facing copy, documentation, or comments
- All user-facing copy is clear, direct, and avoids marketing fluff
- Every package exports through index.ts with explicit named exports
- Every security-relevant function has a JSDoc block explaining the
  threat model it addresses
