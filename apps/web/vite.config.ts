import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(projectRoot, '../../docs');

const securityHeaders = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const shieldcvSecurityHeaders = {
  name: 'shieldcv-security-headers',
  configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (key: string, value: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      for (const [key, value] of Object.entries(securityHeaders)) {
        res.setHeader(key, value);
      }

      next();
    });
  },
  configurePreviewServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (key: string, value: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      for (const [key, value] of Object.entries(securityHeaders)) {
        res.setHeader(key, value);
      }

      next();
    });
  },
};

export default defineConfig({
  resolve: {
    alias: {
      $docs: docsRoot,
    },
  },
  plugins: [
    shieldcvSecurityHeaders,
    tailwindcss(),
    sveltekit(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-runtime-cache',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) =>
              ['style', 'script', 'image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets-cache',
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  preview: {
    headers: securityHeaders,
  },
  server: {
    headers: securityHeaders,
  },
  test: {
    environment: 'jsdom',
  },
});
