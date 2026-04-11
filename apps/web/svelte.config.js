import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      precompress: false,
      strict: true,
    }),
    alias: {
      $crypto: '../../packages/crypto/src',
      $storage: '../../packages/storage/src',
      $ai: '../../packages/ai/src',
      $compliance: '../../packages/compliance/src',
      $audit: '../../packages/audit/src',
    },
  },
};

export default config;
