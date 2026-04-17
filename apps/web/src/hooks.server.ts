import type { Handle } from '@sveltejs/kit';
import { getSecurityHeaders } from '$lib/security';

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

function getContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.'));
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

export const handle: Handle = async ({ event, resolve }) => {
  // Serve AI model files from R2 bucket
  if (event.url.pathname.startsWith('/models/')) {
    const key = event.url.pathname.slice(1); // strip leading slash
    const bucket = /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (event.platform as any)?.env?.MODELS;
    if (!bucket) {
      return new Response('Model storage not configured', { status: 503 });
    }
    const object = await bucket.get(key);
    if (!object) {
      return new Response('Model not found', { status: 404 });
    }
    return new Response(object.body, {
      headers: {
        'content-type': getContentType(key),
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      },
    });
  }

  const response = await resolve(event);
  const nonce = response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
  for (const [header, value] of Object.entries(getSecurityHeaders(event.url.pathname, { nonce }))) {
    response.headers.set(header, value);
  }
  return response;
};
