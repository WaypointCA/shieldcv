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

function aiScanContentSecurityPolicy(nonce?: string): string {
  const nonceSource = nonce ? ` 'nonce-${nonce}'` : '';

  return [
    "default-src 'self'",
    `script-src 'self'${nonceSource} 'strict-dynamic' 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // The AI package performs all inference on-device. These external connect
    // exceptions are only for first-load quantized model downloads from Hugging
    // Face and its Xet file bridge; browser HTTP cache serves later visits.
    "connect-src 'self' blob: https://huggingface.co https://cas-bridge.xethub.hf.co",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
    "require-trusted-types-for 'script'",
    "trusted-types default dompurify svelte svelte-trusted-html",
  ].join('; ');
}

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

  if (pathname.startsWith('/scan')) {
    return {
      ...MAIN_APP_HEADERS,
      'Content-Security-Policy': aiScanContentSecurityPolicy(options.nonce),
    };
  }

  return { ...MAIN_APP_HEADERS };
}
