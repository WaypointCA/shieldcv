# ShieldCV Data Protection Impact Assessment

## 1. Executive Summary

ShieldCV is a local-first resume security platform designed to help students and early-career job seekers create, review, and protect resume content that may contain sensitive personal or regulated information. The application includes an encrypted local resume vault, local AI-assisted resume analysis, compliance-oriented scanners, a tamper-evident audit log, and a sandboxed PDF import workflow.

This Data Protection Impact Assessment (DPIA) evaluates the privacy implications of ShieldCV's architecture and feature set. The central conclusion is that ShieldCV materially reduces conventional cloud privacy risk because user resume data is processed in the browser and stored only in encrypted browser storage under the control of the user. The Cloudflare Worker at the edge serves static assets and security headers only. It does not receive, store, or process resume content.

Because the application is intentionally designed to avoid server-side handling of resume data, many traditional processor and controller risks are eliminated by architecture rather than by policy alone. Residual risks remain around local device security, browser storage access, user-selected passphrase strength, and the software supply chain. These risks are reduced through technical controls including AES-GCM encryption at rest, PBKDF2-SHA-256 key stretching with 600,000 iterations, strict Content Security Policy, Trusted Types enforcement, sandboxed PDF parsing, and automated dependency scanning in CI.

## 2. Purpose and Scope

The purpose of ShieldCV is to help users build and refine resumes without exposing their personal information to third-party AI services, resume platforms, analytics vendors, or cloud databases. The DPIA covers the complete application surface shipped in this repository, including:

- The encrypted local resume builder and vault
- The HIPAA scanner for healthcare-related resume content
- The CMMC scanner for defense-related resume content
- The GDPR application tracker and DSAR template generator
- The local AI inference layer used for NER and embeddings
- The audit logging system
- The PDF import workflow
- The Cloudflare Pages deployment configuration used to serve the application

The DPIA does not cover unrelated services operated by a user's device manufacturer, browser vendor, operating system, or installed browser extensions. Those remain external dependencies outside ShieldCV's direct control.

## 3. Processing Description

### 3.1 Processing objective

ShieldCV processes the user's own resume data so the user can:

- Create or edit resume content locally
- Store resume content in an encrypted local vault
- Scan resume text for HIPAA, CMMC, or privacy-related issues
- Import resume text from PDFs through a sandboxed parser
- Maintain a tamper-evident local audit trail
- Generate GDPR request templates for job application follow-up

### 3.2 Data categories processed

ShieldCV may process the following categories of personal or sensitive resume-related data when the user enters or imports them:

- Names
- Postal addresses or location details
- Email addresses
- Phone numbers
- Employment history
- Education history
- Certifications and credentials
- Skills and keywords
- Project descriptions
- Clinical descriptions or patient-adjacent narrative text
- Defense-related program descriptions
- Job application metadata entered into the GDPR tracker

The application does not require users to provide special category data to a server because there is no server-side submission path for resume content.

### 3.3 Lawful basis

The lawful basis is legitimate interest in the user's own request for local processing of their own data. ShieldCV exists to help the user review, protect, and manage their own resume material. Processing occurs only when initiated by the user in their browser.

Because ShieldCV does not operate a central resume processing backend, the practical data protection relationship is unusual compared with conventional SaaS products. The user remains in direct control of the data lifecycle and initiates all processing locally on their own device.

## 4. Data Flow and System Boundaries

### 4.1 Data flow summary

All meaningful resume processing happens in-browser. The Cloudflare Worker serves static application assets and sets security headers, including per-request CSP nonces. No resume payload is posted back to the Worker. No application server receives, stores, or processes resume content.

Primary data flows:

- User inputs resume data in the browser tab
- Browser tab encrypts data and stores ciphertext in IndexedDB
- Browser tab sends text to a local Web Worker for AI inference
- Browser tab sends PDF bytes to a sandboxed iframe for parsing via `postMessage`
- Browser tab records local security events in an encrypted audit log
- Cloudflare Edge serves static assets, models, and headers to the browser

### 4.2 No server-side resume processing

The Cloudflare deployment serves the application shell, static assets, and local model files from the same origin. It does not:

- Persist resume records
- Process resume text
- Store AI prompts or completions
- Retain GDPR tracker entries
- Receive HIPAA or CMMC scan payloads
- Retain application audit content

This is the defining architectural mitigation in the DPIA.

## 5. Necessity and Proportionality

ShieldCV is designed around data minimization and proportionality:

- Resume processing is limited to what is necessary for local editing, encryption, scanning, and user-requested template generation.
- AI inference is local and purpose-limited to resume assistance, not unrelated profiling.
- Audit logging records security-relevant events without requiring a cloud logging service.
- PDF import is isolated to a sandboxed iframe with message passing rather than direct parser access in the main UI context.
- GDPR assistance is implemented as local templates and trackers rather than outbound data subject request submission.

The product purpose can be fulfilled without transmitting resume content to a remote processor. That is a materially more privacy-preserving design than the common alternative of cloud-hosted AI resume services.

## 6. Risk Assessment

The following matrix uses a qualitative likelihood x impact model.

| Risk | Likelihood | Impact | Rating | Notes |
| --- | --- | --- | --- | --- |
| Data breach via server compromise | Not applicable | High | Not applicable | No server stores resume data. |
| Data breach via browser storage access | Low | Medium | Low | Local ciphertext is protected with AES-GCM. |
| Data breach via network interception | Low | Medium | Low | HTTPS, HSTS, same-origin model serving, and no runtime external connections. |
| Unauthorized access to local vault | Medium | High | Medium | Risk depends on passphrase strength and local device access. |
| Model inference leaking PII to a third party | Not applicable | High | Not applicable | Models run locally in the browser. No external inference API calls. |
| Supply chain attack via dependencies | Low | High | Low | CI scanning, SBOM generation, pinned lockfile, and same-origin asset delivery reduce exposure. |

### 6.1 Data breach via server compromise

This scenario is not applicable to user resume content because ShieldCV does not store resume data on a server. A compromise of the Cloudflare Worker would expose deployed application code and headers, but not stored user resumes, because the architecture never places those records on the server side.

### 6.2 Data breach via browser storage

Local browser storage remains a realistic threat because the ciphertext is stored on the user's device. An attacker with filesystem access, backup access, or browser profile access could extract stored IndexedDB records. The residual likelihood is assessed as low because the data is encrypted at rest using AES-GCM and keyed through PBKDF2-SHA-256 with 600,000 iterations and a per-vault salt. Impact remains medium because resumes may contain significant personal information.

### 6.3 Data breach via network interception

ShieldCV is served over HTTPS with HSTS and does not initiate external runtime requests for AI inference or analytics. Local model assets are served from the same origin after being downloaded at build time. This materially reduces interception risk. Residual likelihood is low and residual impact is medium because static asset interception alone would not reveal stored resume content.

### 6.4 Unauthorized access to the vault

If an attacker gains access to the unlocked browser session or successfully guesses a weak passphrase against extracted ciphertext, the vault can be compromised. This is the most meaningful residual privacy risk in the architecture. Likelihood is medium because passphrase quality varies by user and because local device compromise remains possible. Impact is high because a successful compromise exposes the user's stored resume material.

### 6.5 Model inference leaking PII

This risk is not applicable in the conventional SaaS sense because ShieldCV does not send prompts or resume content to an external inference API. Models run locally in the browser through Web Worker infrastructure. There is no remote LLM log, prompt store, or third-party model service in the runtime path.

### 6.6 Supply chain attack via dependencies

A malicious dependency or compromised build artifact could weaken client-side security or exfiltrate data at runtime. Likelihood is low but non-zero. Impact could be high. The project reduces this risk through OSV-Scanner in CI, Semgrep in CI, CycloneDX SBOM generation, pinned dependency management through `pnpm-lock.yaml`, and same-origin serving of static assets and model files.

## 7. Mitigations

| Risk | Mitigations in ShieldCV |
| --- | --- |
| Browser storage exposure | AES-GCM encryption at rest, PBKDF2-SHA-256 with 600,000 iterations, local-only IndexedDB storage, explicit vault unlock flow |
| Network interception | HTTPS deployment, HSTS, no runtime external connections, same-origin static model serving |
| Unauthorized vault access | Passphrase-derived key, encrypted store lock state, audit trail events for vault lifecycle, no plaintext server backup |
| Injection and script abuse | Per-request CSP nonces, Trusted Types enforcement, strict security headers, sandboxed PDF import |
| Tampering with security events | Hash-chain audit log with tamper detection |
| Oversized or malformed inputs | `MAX_RESUME_SIZE` limit and bounded local processing paths |
| Supply chain compromise | Semgrep, OSV-Scanner, CycloneDX SBOM generation, locked dependencies, build-time model fetch with runtime same-origin delivery |

Additional design-level mitigations include:

- No analytics or telemetry pipeline for resume content
- No cloud synchronization
- No external inference APIs
- No server-side session store
- No server-side prompt history

## 8. Data Retention

ShieldCV does not retain user resume data on a server because it never receives that data. Browser storage persists until the user clears it, deletes individual records, destroys the vault, resets the browser profile, or removes local site data. Retention is therefore user-controlled by design.

The application operator retains only the deployed static application code and infrastructure configuration necessary to serve the site. This does not include user resume content.

## 9. Data Subject Rights

For GDPR Articles 15 through 22, the traditional controller-processor framing is largely moot for ShieldCV-hosted infrastructure because ShieldCV never holds the user's resume data on a server. The user is effectively both the data subject and the party directing the local processing. Rights such as access, portability, and deletion are exercised directly by the user through local control of the browser vault and device storage.

ShieldCV still includes GDPR educational content and DSAR templates because users may need to exercise those rights against employers, ATS platforms, and recruiting tools that do hold their application data.

## 10. Automated Decision-Making

ShieldCV uses local AI components for narrow assistive functions such as named entity recognition, embeddings, and resume suggestions. These features do not make hiring decisions, determine eligibility, rank candidates for employers, or trigger legal or similarly significant effects. The system produces local suggestions for the user to review and accept or reject.

No automated hiring decision-making is performed by ShieldCV.

## 11. Residual Risk and Limitations

ShieldCV materially reduces privacy risk, but it does not eliminate all endpoint risk. Residual limitations include:

- JavaScript memory cannot be guaranteed to be securely erased
- A malicious browser extension could inspect the DOM of an unlocked session
- A compromised operating system can defeat application-layer protections
- Weak passphrases reduce the effectiveness of PBKDF2 key stretching
- A user who leaves the vault unlocked on a shared device accepts additional local risk

These limitations are normal for web applications running on general-purpose consumer devices and are disclosed in the project's public threat model.

## 12. Conclusion

ShieldCV's local-first architecture eliminates most conventional DPIA concerns by design because resume data never leaves the user's device during normal operation. There is no server-side resume database to breach, no third-party AI API to trust, and no remote retention layer to manage.

The primary residual privacy risk is unauthorized access to locally stored ciphertext through weak passphrases or device compromise. ShieldCV mitigates that risk with PBKDF2-SHA-256 key stretching at 600,000 iterations, AES-GCM encryption at rest, strict browser security controls, same-origin runtime behavior, and transparent compliance and threat-model documentation.

On balance, the DPIA concludes that ShieldCV presents a low residual privacy risk relative to the class of cloud-based AI resume tools it is intended to replace.
