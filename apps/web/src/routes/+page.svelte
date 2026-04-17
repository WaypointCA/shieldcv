<script lang="ts">
  import {
    ArrowRight,
    ChartNoAxesColumn,
    ClipboardList,
    ExternalLink,
    ScanSearch,
    Shield,
    ShieldAlert,
  } from 'lucide-svelte';

  const pageTitle = 'ShieldCV - Local-First Resume Security';
  const pageDescription =
    'ShieldCV scans your resume for compliance violations and ATS keyword gaps. The AI runs in your browser. Your data never leaves your device. Zero external requests. Zero data retention. Zero trust required.';
  const pageUrl = 'https://shieldcv.app/';

  const featureCards = [
    {
      title: 'Compliance Scanner',
      description:
        'Scan your resume for HIPAA Protected Health Information, CMMC Controlled Unclassified Information, and GDPR data rights. Each finding includes regulatory citations and compliant alternatives.',
      href: '/scan?demo=1',
      linkLabel: 'Try the HIPAA demo',
      icon: Shield,
    },
    {
      title: 'ATS Match',
      description:
        'Paste a job description and see how your resume matches. Cosine similarity scoring, missing keyword detection, and placement suggestions. All analysis runs locally.',
      href: '/scan?tab=ats&mode=demo',
      linkLabel: 'Try ATS matching',
      icon: ChartNoAxesColumn,
    },
    {
      title: 'Attack Mode',
      description:
        'Watch ShieldCV block 7 real attack payloads in real time. XSS, prototype pollution, CSP violations, and more. Every block is logged to a tamper-evident audit chain.',
      href: '/attack-mode',
      linkLabel: 'Enter Attack Mode',
      icon: ShieldAlert,
    },
    {
      title: 'Application Tracker',
      description:
        'Track every job application in one encrypted place. Know which companies have your data. Exercise your GDPR rights with one click.',
      href: '/tracker',
      linkLabel: 'Start tracking',
      icon: ClipboardList,
    },
  ] as const;

  const securityProperties = [
    {
      title: 'Per-request CSP nonces via Cloudflare Worker',
      detail: 'Every response carries a fresh nonce to protect scripts and styles from inline injection.',
    },
    {
      title: 'Trusted Types enforcement (no unsafe innerHTML)',
      detail: 'The UI blocks dangerous DOM sinks so untrusted markup cannot be injected into the page.',
    },
    {
      title: 'AES-GCM encryption at rest (PBKDF2 600K iterations)',
      detail: 'Resume data is encrypted locally with a passphrase-derived key before it reaches browser storage.',
    },
    {
      title: 'Zero external runtime connections',
      detail: 'The app is designed to run locally without shipping resume contents to third-party APIs or services.',
    },
    {
      title: 'In-browser AI via Transformers.js WebAssembly',
      detail: 'Scanning and ATS analysis execute on-device instead of in a remote inference pipeline.',
    },
    {
      title: 'Hash-chain tamper-evident audit log',
      detail: 'Security-relevant events are linked together so unexpected edits are easier to detect.',
    },
    {
      title: '100% test coverage on all security packages',
      detail: 'Core security packages ship with complete automated test coverage to reduce blind spots.',
    },
    {
      title: 'DPIA, STRIDE threat model, CycloneDX SBOM',
      detail: 'The security program includes privacy, threat-modeling, and software supply chain documentation.',
    },
  ] as const;
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:type" content="website" />
</svelte:head>

<section class="landing-hero hero-card">
  <div class="landing-hero__copy">
    <p class="section-kicker">Local-First Resume Security</p>
    <h3>Your resume. Your device. Your AI.</h3>
    <p class="landing-hero__lede">{pageDescription}</p>

    <div class="landing-hero__actions">
      <a class="shell-button shell-button--primary landing-hero__primary" href="/scan?demo=1">
        <ScanSearch size={18} />
        <span>Try the Demo</span>
      </a>
      <a class="shell-button" href="/resumes">Create Your Vault</a>
    </div>
  </div>

  <div class="landing-hero__panel">
    <div class="landing-stat">
      <span class="landing-stat__label">Best first click</span>
      <strong>HIPAA demo on /scan</strong>
      <p>Shows local AI compliance analysis immediately, no vault unlock required.</p>
    </div>
    <div class="landing-stat">
      <span class="landing-stat__label">Fast trust signal</span>
      <strong>Attack Mode</strong>
      <p>Demonstrates real-time blocking, CSP enforcement, and tamper-evident audit logging.</p>
    </div>
  </div>
</section>

<section class="landing-section">
  <div class="section-header landing-section__header">
    <div>
      <p class="section-kicker">Core Flows</p>
      <h3>See what ShieldCV does in one click</h3>
    </div>
  </div>

  <div class="feature-grid">
    {#each featureCards as card}
      <article class="content-card feature-card">
        <div class="feature-card__icon">
          <card.icon size={20} />
        </div>
        <h3>{card.title}</h3>
        <p>{card.description}</p>
        <a class="feature-card__link" href={card.href}>
          <span>{card.linkLabel}</span>
          <ArrowRight size={16} />
        </a>
      </article>
    {/each}
  </div>
</section>

<section class="content-card landing-section">
  <div class="section-header landing-section__header">
    <div>
      <p class="section-kicker">Why ShieldCV?</p>
      <h3>Privacy and compliance risks start before you ever click apply</h3>
    </div>
  </div>

  <div class="landing-copy">
    <p>
      Every AI resume tool asks you to upload your resume to their servers. Career centers like UC
      Berkeley warn students to strip personally identifying information before using these tools.
      Healthcare students describing clinical rotations risk HIPAA violations. Defense applicants
      risk exposing Controlled Unclassified Information. And every applicant leaves a data trail
      across dozens of ATS systems with no easy way to exercise their privacy rights.
    </p>
    <p>
      ShieldCV is different. The AI models run in your browser via WebAssembly. Your resume is
      encrypted with AES-GCM using a key derived from your passphrase. The encryption key never
      leaves your device. There is no server that stores, processes, or even sees your data.
    </p>
  </div>
</section>

<section class="content-card landing-section">
  <div class="section-header landing-section__header">
    <div>
      <p class="section-kicker">Security Architecture</p>
      <h3>Built to verify, not just claim</h3>
    </div>
  </div>

  <div class="security-grid">
    {#each securityProperties as item}
      <article class="security-item">
        <h4>{item.title}</h4>
        <p>{item.detail}</p>
      </article>
    {/each}
  </div>

  <div class="landing-links">
    <a class="shell-button shell-button--primary" href="/security">Verify our claims</a>
    <a class="shell-button" href="https://github.com/WaypointCA/shieldcv" target="_blank" rel="noreferrer">
      <span>See the source</span>
      <ExternalLink size={16} />
    </a>
  </div>
</section>

<footer class="content-card landing-footer">
  <div>
    <p class="section-kicker">Waypoint Compliance Advisory</p>
    <h3>Built by Waypoint Compliance Advisory</h3>
    <p>Built for the Handshake x OpenAI Codex Creator Challenge.</p>
  </div>

  <div class="landing-footer__meta">
    <span>MIT License</span>
  </div>

  <div class="landing-footer__links">
    <a href="https://github.com/WaypointCA/shieldcv" target="_blank" rel="noreferrer">GitHub</a>
    <a href="/security">Security Policy</a>
    <a href="mailto:hello@shieldcv.app">hello@shieldcv.app</a>
  </div>
</footer>

<style>
  .landing-section {
    display: grid;
    gap: 1.25rem;
  }

  .landing-section__header {
    margin-bottom: 0;
  }

  .landing-hero {
    position: relative;
    overflow: hidden;
    display: grid;
    gap: 1.5rem;
    padding: 1.5rem;
    background:
      radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 32%),
      linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(8, 17, 31, 0.98) 100%);
  }

  .landing-hero__copy {
    display: grid;
    gap: 1rem;
  }

  .landing-hero__copy h3 {
    max-width: 10ch;
  }

  .landing-hero__lede {
    max-width: 62rem;
    font-size: 1rem;
  }

  .landing-hero__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
  }

  .landing-hero__primary {
    min-width: 12rem;
    justify-content: center;
  }

  .landing-hero__panel {
    display: grid;
    gap: 0.9rem;
  }

  .landing-stat {
    border: 1px solid var(--border);
    border-radius: 1.2rem;
    background: rgba(8, 17, 31, 0.72);
    padding: 1rem;
  }

  .landing-stat strong {
    display: block;
    margin-bottom: 0.45rem;
    color: var(--text);
    font-size: 1rem;
  }

  .landing-stat p {
    margin: 0;
    color: var(--text-muted);
  }

  .landing-stat__label {
    display: inline-block;
    margin-bottom: 0.55rem;
    color: var(--accent);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .feature-grid,
  .security-grid {
    display: grid;
    gap: 1rem;
  }

  .feature-card {
    display: grid;
    gap: 0.9rem;
  }

  .feature-card h3,
  .security-item h4,
  .landing-footer h3 {
    margin: 0;
    color: var(--text);
  }

  .feature-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }

  .feature-card__link {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
  }

  .landing-copy {
    display: grid;
    gap: 1rem;
  }

  .landing-copy p,
  .security-item p,
  .landing-footer p {
    margin: 0;
  }

  .security-item {
    border: 1px solid var(--border);
    border-radius: 1.15rem;
    background: var(--bg-muted);
    padding: 1rem;
  }

  .security-item p {
    margin-top: 0.45rem;
    color: var(--text-muted);
  }

  .landing-links,
  .landing-footer__links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .landing-footer {
    display: grid;
    gap: 1rem;
  }

  .landing-footer__meta {
    color: var(--text-soft);
    font-size: 0.95rem;
  }

  .landing-footer__links a {
    color: var(--text-soft);
    text-decoration: none;
  }

  .landing-footer__links a:hover,
  .landing-footer__links a:focus-visible,
  .feature-card__link:hover,
  .feature-card__link:focus-visible {
    color: var(--text);
  }

  @media (min-width: 768px) {
    .landing-hero {
      grid-template-columns: minmax(0, 1.75fr) minmax(18rem, 0.95fr);
      align-items: stretch;
      padding: 1.75rem;
    }

    .feature-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .security-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .landing-footer {
      grid-template-columns: minmax(0, 1.4fr) auto;
      align-items: start;
    }

    .landing-footer__links {
      justify-content: flex-end;
      align-self: end;
    }
  }
</style>
