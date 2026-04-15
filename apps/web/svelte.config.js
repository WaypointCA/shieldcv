import adapter from '@sveltejs/adapter-cloudflare';
import { mdsvex } from 'mdsvex';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte', '.svx', '.md'],
  preprocess: [
    vitePreprocess(),
    mdsvex({
      extensions: ['.svx', '.md'],
    }),
  ],
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'nonce',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', 'strict-dynamic', 'wasm-unsafe-eval'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:'],
        'font-src': ['self', 'data:'],
        'connect-src': ['self', 'blob:'],
        'worker-src': ['self', 'blob:'],
        'child-src': ['self', 'blob:'],
        'frame-src': ['self', 'blob:'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
        'manifest-src': ['self'],
        'upgrade-insecure-requests': true,
        'require-trusted-types-for': ['script'],
        'trusted-types': ['default', 'dompurify', 'svelte', 'svelte-trusted-html'],
      },
    },
    alias: {
      $crypto: '../../packages/crypto/src',
      $storage: '../../packages/storage/src',
      $resume: '../../packages/resume/src',
      $ai: '../../packages/ai/src',
      $compliance: '../../packages/compliance/src',
      $audit: '../../packages/audit/src',
      $docs: '../../docs',
    },
  },
};

export default config;
