// WEBKIT_EXECUTABLE and CHROMIUM_EXECUTABLE select installed browser builds when they differ from the ones this
// Playwright version expects.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4329;
const webkitExecutable = process.env['WEBKIT_EXECUTABLE'];
const chromiumExecutable = process.env['CHROMIUM_EXECUTABLE'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'phone',
      use: { ...devices['iPhone 15'], browserName: 'webkit', ...(webkitExecutable ? { launchOptions: { executablePath: webkitExecutable } } : {}) },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
  ],
  webServer: {
    command: `pnpm run build && pnpm exec astro preview --ignore-lock --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
