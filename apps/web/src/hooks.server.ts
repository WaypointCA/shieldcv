import type { Handle } from '@sveltejs/kit';
import { getSecurityHeaders } from '$lib/security';

function extractCspNonce(response: Response): string | undefined {
  return response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
}

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const nonce = extractCspNonce(response);

  for (const [header, value] of Object.entries(getSecurityHeaders(event.url.pathname, { nonce }))) {
    response.headers.set(header, value);
  }

  return response;
};
