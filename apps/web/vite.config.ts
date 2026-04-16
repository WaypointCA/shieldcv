import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { getSecurityHeaders } from './src/lib/security';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(projectRoot, '../..');
const docsRoot = path.resolve(projectRoot, '../../docs');

const shieldcvSecurityHeaders = {
  name: 'shieldcv-security-headers',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (key: string, value: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      const pathname = req.url ? new URL(req.url, 'http://shieldcv.local').pathname : '/';

      for (const [key, value] of Object.entries(getSecurityHeaders(pathname))) {
        res.setHeader(key, value);
      }

      next();
    });
  },
  configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (key: string, value: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      const pathname = req.url ? new URL(req.url, 'http://shieldcv.local').pathname : '/';

      for (const [key, value] of Object.entries(getSecurityHeaders(pathname))) {
        res.setHeader(key, value);
      }

      next();
    });
  },
};

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) {
            return 'pdfjs-worker';
          }

          if (id.includes('@huggingface/transformers') || id.includes('onnxruntime-web')) {
            return 'transformers-ai';
          }
        },
      },
    },
  },
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
        // pdf.js and Transformers.js are route-isolated and should be fetched
        // only when their sandbox/AI routes load, not during service-worker install.
        globIgnores: [
          '**/_app/immutable/chunks/pdfjs-worker*.js',
          '**/_app/immutable/chunks/transformers-ai*.js',
          '**/_app/immutable/workers/**',
          '**/*transformers*.js',
          '**/*ort*.wasm',
          '**/models/**',
          'models/**/*',
        ],
        manifestTransforms: [
          (entries) => ({
            manifest: entries.filter(
              (entry) => !(entry.url.startsWith('_app/immutable/chunks/') && entry.size > 400 * 1024)
            ),
            warnings: [],
          }),
        ],
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
    headers: getSecurityHeaders('/'),
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
    headers: getSecurityHeaders('/'),
  },
  test: {
    environment: 'jsdom',
  },
});
