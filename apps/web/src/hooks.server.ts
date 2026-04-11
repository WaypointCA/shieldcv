import type { Handle } from '@sveltejs/kit';

const RESPONSE_SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  for (const [header, value] of Object.entries(RESPONSE_SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }

  return response;
};
