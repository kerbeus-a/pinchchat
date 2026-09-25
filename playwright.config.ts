import { defineConfig, devices } from '@playwright/test';

const appUrl = process.env.KINCHAT_E2E_APP_URL ?? 'http://127.0.0.1:5174/kinchat/';
const skipWebServer = process.env.KINCHAT_E2E_SKIP_WEBSERVER === '1';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: 'test-results/playwright',
  preserveOutput: 'never',
  reporter: [['list']],
  use: {
    baseURL: appUrl,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : undefined,
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5174',
        url: appUrl,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
