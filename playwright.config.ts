import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5197',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @tv/web dev',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: false,
    env: {
      WEB_PORT: '5197',
      VITE_E2E: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
