import { defineConfig, devices } from '@playwright/test';

const skipWebServer = process.env.PW_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: 'pnpm --filter web exec vite dev --host 127.0.0.1 --port 4174',
        url: 'http://127.0.0.1:4174',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
