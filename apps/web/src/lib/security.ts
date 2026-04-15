const SHARED_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
} as const;

const MAIN_APP_HEADERS = {
  ...SHARED_HEADERS,
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

const SVELTEKIT_ROOT_STYLE_HASH = "'sha256-tcbDxjMo+xKqM21aCGYbs/QAJqB7yUXC06oPWDapBgc='";

function pdfWorkerContentSecurityPolicy(nonce?: string): string {
  const nonceSource = nonce ? ` 'nonce-${nonce}'` : '';

  return [
    "default-src 'self'",
    `script-src 'self'${nonceSource} 'wasm-unsafe-eval'`,
    `style-src 'self' 'unsafe-hashes' ${SVELTEKIT_ROOT_STYLE_HASH}`,
    "img-src 'self' data: blob:",
    "connect-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    'sandbox allow-scripts',
  ].join('; ');
}

const PDF_WORKER_HEADERS = {
  ...SHARED_HEADERS,
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'unsafe-none',
  'Cross-Origin-Embedder-Policy': 'unsafe-none',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

export function getSecurityHeaders(pathname: string, options: { nonce?: string } = {}): Record<string, string> {
  if (pathname.startsWith('/pdf-worker')) {
    return {
      ...PDF_WORKER_HEADERS,
      'Content-Security-Policy': pdfWorkerContentSecurityPolicy(options.nonce),
    };
  }

  return { ...MAIN_APP_HEADERS };
}
